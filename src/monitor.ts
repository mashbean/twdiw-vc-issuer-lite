// The monitor: one daily scan of the Taiwan digital-credential ecosystem, kept
// as history so the dashboard can show change rather than a snapshot.
//
// Why store anything at all, in a project whose verifier keeps nothing? Because
// the two are different kinds of data. A presentation is somebody's identity
// document and is never written down. What this stores is the public register
// itself — who is listed, what the contract says, whether an endpoint answered
// — none of it personal, and worth nothing unless kept long enough to diff.
// That diff is the product: "the trust list gained an issuer", "this status
// list revoked eleven more cards", "the API claims an anchor the chain does not
// have" are only visible against yesterday.
//
// One scan a day. The registers move slowly, a daily rhythm keeps the load on
// other people's infrastructure negligible, and a year of daily points is a
// readable trend.

import { DurableObject } from "cloudflare:workers";
import { ARBITRUM_RPCS, scanChain, type ChainVerdict, type Registration } from "./chain";
import { censusPayload, takeCensus, totalRevoked, type Census } from "./catalogue";
import {
  WATCHED_REPOS,
  endpointTargets,
  probeEndpoint,
  probeRepo,
  probeStatusList,
  statusListTargets,
  type CheckResult,
  type JsonValue,
} from "./probes";
import { describeRoles, describeVerdict } from "./monitor-wording";
import { runIssuanceSelfTest } from "./selftest";
import { fetchOfficialTrustList, officialTrustFor, type TrustEntry } from "./trust";

const CHECK_RETENTION_DAYS = 180;
const EVENT_RETENTION_DAYS = 365;
/** The floor between scans a visitor can force. The cron owns the daily rhythm;
 *  this only exists so a cold deployment and an impatient reload are possible
 *  without letting the page become a way to hammer other people's servers. */
export const MIN_MANUAL_INTERVAL_MS = 60 * 60 * 1000;

export interface MonitorEvent {
  at: number;
  kind: string;
  target: string;
  summary: string;
  detail?: string;
}

interface StoredCheck extends CheckResult {
  at: number;
}

export interface DashboardPayload {
  lastRunAt?: number;
  lastRunMs?: number;
  running: boolean;
  schedule: string;
  checks: Array<StoredCheck & { history: Array<{ at: number; ok: boolean; latencyMs?: number }> }>;
  trust?: {
    at: number;
    total: number;
    issuers: number;
    verifiers: number;
    both: number;
    withAnchorClaim: number;
    registryError?: string;
    self?: { didKey: string; onOfficialList: boolean; reason?: string };
  };
  chain?: {
    at: number;
    verified: number;
    mismatch: number;
    notAnchored: number;
    unavailable: number;
    blockNumber?: string;
    rpcOk: boolean;
    rpcError?: string;
    rpcEndpoint?: string;
    rpcTrail?: string[];
    problems: Array<{ did: string; name?: string; verdict: ChainVerdict; reason?: string }>;
  };
  census?: {
    at: number;
    issuersAsked: number;
    issuersAnswered: number;
    typesFound: number;
    unreadable: number;
    silentIssuers?: string[];
    totalRevoked: number;
    entries: Array<{
      issuer: string; issuerId: string; credentialType: string;
      displayName?: string; looksLikeTest?: boolean; url: string;
      totalBits: number; revoked: number; kid?: string;
      keyInIssuerDid: boolean; subjectMatchesUrl: boolean;
    }>;
  };
  events: MonitorEvent[];
  runs: Array<{ at: number; ms: number; ok: number; failed: number }>;
}

export class MonitorState extends DurableObject<Env> {
  private ready = false;

  private sql() {
    const sql = this.ctx.storage.sql;
    if (!this.ready) {
      sql.exec(`CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        ok_count INTEGER NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        target TEXT NOT NULL,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        ok INTEGER NOT NULL,
        http_status INTEGER,
        latency_ms INTEGER,
        detail TEXT,
        data TEXT
      )`);
      sql.exec(`CREATE INDEX IF NOT EXISTS checks_target_at ON checks (target, at)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (
        target TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        body TEXT NOT NULL
      )`);
      sql.exec(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        target TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT
      )`);
      sql.exec(`CREATE INDEX IF NOT EXISTS events_at ON events (at)`);
      this.ready = true;
    }
    return sql;
  }

  private snapshot<T>(target: string): T | undefined {
    const rows = this.sql().exec("SELECT body FROM snapshots WHERE target = ?", target).toArray();
    const body = rows[0]?.body;
    if (typeof body !== "string") return undefined;
    try {
      return JSON.parse(body) as T;
    } catch {
      return undefined;
    }
  }

  private putSnapshot(target: string, at: number, body: unknown): void {
    this.sql().exec(
      "INSERT INTO snapshots (target, at, body) VALUES (?, ?, ?) " +
      "ON CONFLICT(target) DO UPDATE SET at = excluded.at, body = excluded.body",
      target, at, JSON.stringify(body),
    );
  }

  private addEvent(event: MonitorEvent): void {
    this.sql().exec(
      "INSERT INTO events (at, kind, target, summary, detail) VALUES (?, ?, ?, ?, ?)",
      event.at, event.kind, event.target, event.summary, event.detail ?? null,
    );
  }

  private recordCheck(at: number, check: CheckResult): void {
    this.sql().exec(
      "INSERT INTO checks (at, target, category, label, ok, http_status, latency_ms, detail, data) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      at, check.target, check.category, check.label, check.ok ? 1 : 0,
      check.httpStatus ?? null, check.latencyMs ?? null, check.detail ?? null,
      check.data ? JSON.stringify(check.data) : null,
    );
  }

  /** Was this target failing the last time we looked? Used so an outage raises
   *  one event when it starts and one when it clears, not one a day for weeks. */
  private previousOk(target: string): boolean | undefined {
    const rows = this.sql()
      .exec("SELECT ok FROM checks WHERE target = ? ORDER BY at DESC LIMIT 1", target)
      .toArray();
    const value = rows[0]?.ok;
    return value === undefined ? undefined : Number(value) === 1;
  }

  async lastRunAt(): Promise<number | undefined> {
    const rows = this.sql().exec("SELECT MAX(finished_at) AS at FROM runs").toArray();
    const at = rows[0]?.at;
    return typeof at === "number" ? at : undefined;
  }

  /** Runs a scan unless one happened within `minIntervalMs`. Returns whether it
   *  ran, so the caller can tell a visitor the data is simply recent. */
  async runIfStale(origin: string, minIntervalMs = MIN_MANUAL_INTERVAL_MS): Promise<boolean> {
    const last = await this.lastRunAt();
    if (last !== undefined && Date.now() - last < minIntervalMs) return false;
    await this.run(origin);
    return true;
  }

  async run(origin: string): Promise<{ ok: number; failed: number; ms: number }> {
    const sql = this.sql();
    const startedAt = Date.now();
    sql.exec("INSERT INTO runs (started_at) VALUES (?)", startedAt);
    const runId = Number(sql.exec("SELECT last_insert_rowid() AS id").toArray()[0]?.id ?? 0);

    const results: CheckResult[] = [];
    const collect = async (task: Promise<CheckResult>) => {
      try {
        results.push(await task);
      } catch (error) {
        // A probe that throws is itself a finding, never a reason to lose the
        // rest of the scan.
        results.push({
          target: "probe-error", category: "api", label: "探測器例外", ok: false,
          detail: error instanceof Error ? error.message : "未知錯誤",
        });
      }
    };

    // 1. Endpoint health, in parallel — they are other people's servers and a
    // handful of concurrent GETs once a day is polite.
    await Promise.all(endpointTargets(origin).map((target) => collect(probeEndpoint(target))));

    // 2. The issuance path itself.
    await collect(runIssuanceSelfTest(origin));

    // 3. Status lists.
    await Promise.all(statusListTargets(origin).map((target) => collect(probeStatusList(target))));

    // 4. Repositories.
    const githubToken = (this.env as { GITHUB_TOKEN?: string }).GITHUB_TOKEN;
    await Promise.all(WATCHED_REPOS.map((entry) => collect(probeRepo(entry, { token: githubToken }))));

    // 5. The trust list, then the chain comparison built from it.
    const registry = this.env.OFFICIAL_TRUST_REGISTRY_URL;
    const list = await fetchOfficialTrustList(registry).catch(() => undefined);
    const at = Date.now();

    if (list) {
      this.diffTrustList(at, list.entries, list.error);

      // The revocation census: every registered issuer's credential types and
      // the register behind each one. This is the part of the ecosystem that is
      // otherwise invisible — a status list URL is only published inside the
      // credentials that point at it.
      try {
        const census = await takeCensus(list.entries);
        this.diffCensus(at, census);
        results.push({
          target: "status-census", category: "status-list", label: "撤銷清單普查",
          ok: census.entries.length > 0,
          detail: `${census.issuersAnswered}/${census.issuersAsked} 個發行者、${census.entries.length} 份清單、共 ${totalRevoked(census)} 張已撤銷`,
          data: {
            tier: "official", lists: census.entries.length, revoked: totalRevoked(census),
            silent: census.silentIssuers.join("、"),
          },
        });
      } catch {
        results.push({
          target: "status-census", category: "status-list", label: "撤銷清單普查",
          ok: false, detail: "普查未能完成", data: { tier: "official" },
        });
      }

      const registrations: Registration[] = list.entries.flatMap((entry) => entry.registrations);
      if (registrations.length) {
        // A keyed endpoint, when the operator has set one, goes first: the free
        // public RPCs throttle Cloudflare's shared egress addresses, which is
        // the difference between a full comparison and a half-empty one.
        const keyed = (this.env as { ARBITRUM_RPC_URL?: string }).ARBITRUM_RPC_URL?.trim();
        const scan = await scanChain(registrations, {
          rpcURLs: keyed ? [keyed, ...ARBITRUM_RPCS] : undefined,
        });
        this.recordChain(at, scan, list.entries);
        results.push({
          target: "arbitrum-rpc", category: "chain", label: "Arbitrum RPC",
          ok: scan.rpcOk, latencyMs: scan.rpcLatencyMs,
          detail: scan.rpcOk ? `區塊 ${scan.blockNumber ?? "未知"}` : (scan.rpcError ?? "無法連線"),
          data: { blockNumber: scan.blockNumber },
        });
      }
    } else {
      results.push({
        target: "official-trust-list", category: "api", label: "官方信任清單抓取",
        ok: false, detail: "無法取得完整清單",
      });
    }

    // 6. This site's own standing in the official register, which is expected to
    // be "absent" and is worth noticing the day it changes.
    try {
      const identity = await this.env.IDENTITY.getByName("issuer").identity();
      const verdict = await officialTrustFor(identity.didKey, registry);
      const previous = this.snapshot<{ onOfficialList: boolean }>("self-trust");
      if (previous && previous.onOfficialList !== verdict.trusted) {
        this.addEvent({
          at, kind: "self-trust-changed", target: "self-trust",
          summary: verdict.trusted ? "本站的 DID 出現在官方信任清單上" : "本站的 DID 已不在官方信任清單上",
        });
      }
      this.putSnapshot("self-trust", at, {
        didKey: identity.didKey, onOfficialList: verdict.trusted, reason: verdict.reason,
      });
    } catch {
      // The identity object being briefly unavailable is not a monitor failure.
    }

    // Record every check, and raise an event only where the state changed.
    for (const check of results) {
      const before = this.previousOk(check.target);
      this.recordCheck(at, check);
      if (before === undefined || before === check.ok) continue;
      this.addEvent({
        at,
        kind: check.ok ? "recovered" : "down",
        target: check.target,
        summary: check.ok ? `${check.label} 恢復正常` : `${check.label} 異常`,
        detail: check.detail,
      });
    }

    const okCount = results.filter((check) => check.ok).length;
    const failCount = results.length - okCount;
    const finishedAt = Date.now();
    sql.exec("UPDATE runs SET finished_at = ?, ok_count = ?, fail_count = ? WHERE id = ?",
             finishedAt, okCount, failCount, runId);
    this.prune(finishedAt);
    return { ok: okCount, failed: failCount, ms: finishedAt - startedAt };
  }

  /** Who joined, who left, and who changed — the trust list's real news. */
  private diffTrustList(at: number, entries: TrustEntry[], error?: string): void {
    interface Stored { did: string; name: string; orgTypes: number[]; hosts: string[] }
    const current: Stored[] = entries.map((entry) => ({
      did: entry.did, name: entry.name, orgTypes: entry.orgTypes, hosts: entry.hosts,
    }));
    const previous = this.snapshot<Stored[]>("trust-list");

    if (previous) {
      const before = new Map(previous.map((item) => [item.did, item]));
      const after = new Map(current.map((item) => [item.did, item]));
      for (const [did, item] of after) {
        if (!before.has(did)) {
          this.addEvent({
            at, kind: "trust-added", target: "trust-list",
            summary: `信任清單新增：${item.name}`,
            detail: `${did}｜${item.hosts.join("、") || "未提供端點"}`,
          });
        }
      }
      for (const [did, item] of before) {
        if (!after.has(did)) {
          this.addEvent({
            at, kind: "trust-removed", target: "trust-list",
            summary: `信任清單移除：${item.name}`,
            detail: did,
          });
          continue;
        }
        const now = after.get(did)!;
        if (now.name !== item.name) {
          this.addEvent({
            at, kind: "trust-renamed", target: "trust-list",
            summary: `機構更名：${item.name} → ${now.name}`, detail: did,
          });
        }
        if (now.orgTypes.join(",") !== item.orgTypes.join(",")) {
          this.addEvent({
            at, kind: "trust-role-changed", target: "trust-list",
            summary: `${now.name} 的角色變更`,
            detail: `${describeRoles(item.orgTypes)} → ${describeRoles(now.orgTypes)}`,
          });
        }
        if (now.hosts.join(",") !== item.hosts.join(",")) {
          this.addEvent({
            at, kind: "trust-endpoint-changed", target: "trust-list",
            summary: `${now.name} 的登記端點變更`,
            detail: `${item.hosts.join("、") || "無"} → ${now.hosts.join("、") || "無"}`,
          });
        }
      }
    }

    this.putSnapshot("trust-list", at, current);
    this.putSnapshot("trust-summary", at, {
      total: entries.length,
      issuers: entries.filter((entry) => entry.orgTypes.includes(1)).length,
      verifiers: entries.filter((entry) => entry.orgTypes.includes(2)).length,
      both: entries.filter((entry) => entry.orgTypes.length > 1).length,
      withAnchorClaim: entries.filter((entry) => entry.onChain).length,
      registryError: error,
    });
  }

  /** Revocation is the news here: a register whose count moved means cards were
   *  revoked since yesterday, and that is worth publishing. A new or vanished
   *  credential type is worth publishing too. */
  private diffCensus(at: number, census: Census): void {
    const previous = this.snapshot<{ entries: Array<{ url: string; revoked: number; credentialType: string; issuer: string }> }>("status-census");
    if (previous?.entries) {
      const before = new Map(previous.entries.map((entry) => [entry.url, entry]));
      for (const entry of census.entries) {
        const was = before.get(entry.url);
        if (!was) {
          this.addEvent({
            at, kind: "register-added", target: "status-census",
            summary: `新的卡種與撤銷清單：${entry.issuer}`,
            detail: `${entry.credentialType}｜目前已撤銷 ${entry.revoked} 張`,
          });
          continue;
        }
        if (was.revoked !== entry.revoked) {
          const delta = entry.revoked - was.revoked;
          this.addEvent({
            at, kind: "revocations-changed", target: "status-census",
            summary: `${entry.issuer} 撤銷數 ${delta > 0 ? "+" : ""}${delta}（共 ${entry.revoked} 張）`,
            detail: entry.credentialType,
          });
        }
      }
      const now = new Set(census.entries.map((entry) => entry.url));
      for (const entry of previous.entries) {
        if (!now.has(entry.url)) {
          this.addEvent({
            at, kind: "register-removed", target: "status-census",
            summary: `卡種或撤銷清單消失：${entry.issuer}`,
            detail: entry.credentialType,
          });
        }
      }
    }
    this.putSnapshot("status-census", at, censusPayload(census));
  }

  private recordChain(at: number, scan: Awaited<ReturnType<typeof scanChain>>, entries: TrustEntry[]): void {
    const names = new Map(entries.map((entry) => [entry.did, entry.name]));
    const counts: Record<ChainVerdict, number> = { verified: 0, mismatch: 0, notAnchored: 0, unavailable: 0 };
    const problems: Array<{ did: string; name?: string; verdict: ChainVerdict; reason?: string }> = [];
    for (const check of scan.byDid.values()) {
      counts[check.verdict] += 1;
      if (check.verdict === "mismatch") {
        problems.push({ did: check.did, name: names.get(check.did), verdict: check.verdict, reason: check.reason });
      }
    }

    const previous = this.snapshot<{ verdicts: Record<string, ChainVerdict> }>("chain");
    const verdicts: Record<string, ChainVerdict> = {};
    for (const [did, check] of scan.byDid) verdicts[did] = check.verdict;
    if (previous) {
      for (const [did, verdict] of Object.entries(verdicts)) {
        const before = previous.verdicts[did];
        // An RPC hiccup is not news; a move into or out of `mismatch` is.
        if (!before || before === verdict) continue;
        if (before === "unavailable" || verdict === "unavailable") continue;
        this.addEvent({
          at, kind: "chain-verdict-changed", target: "chain",
          summary: `${names.get(did) ?? did} 的鏈上比對結果改變`,
          detail: `${describeVerdict(before)} → ${describeVerdict(verdict)}`,
        });
      }
    }
    this.putSnapshot("chain", at, {
      verdicts, counts, problems,
      blockNumber: scan.blockNumber, rpcOk: scan.rpcOk,
      rpcError: scan.rpcError,
      // Host only. The configured endpoint may carry an API key in its path and
      // that must never reach a page or a stored snapshot.
      rpcEndpoint: scan.rpcEndpoint ? safeHost(scan.rpcEndpoint) : undefined,
      rpcTrail: scan.rpcTrail,
    });
  }

  private prune(now: number): void {
    const sql = this.sql();
    sql.exec("DELETE FROM checks WHERE at < ?", now - CHECK_RETENTION_DAYS * 86_400_000);
    sql.exec("DELETE FROM events WHERE at < ?", now - EVENT_RETENTION_DAYS * 86_400_000);
    sql.exec("DELETE FROM runs WHERE started_at < ?", now - EVENT_RETENTION_DAYS * 86_400_000);
  }

  async dashboard(): Promise<DashboardPayload> {
    const sql = this.sql();
    const latest = sql.exec(
      `SELECT c.* FROM checks c
       JOIN (SELECT target, MAX(at) AS at FROM checks GROUP BY target) m
         ON c.target = m.target AND c.at = m.at
       ORDER BY c.category, c.label`,
    ).toArray();

    const since = Date.now() - 60 * 86_400_000;
    const history = sql.exec(
      "SELECT target, at, ok, latency_ms FROM checks WHERE at >= ? ORDER BY at ASC", since,
    ).toArray();
    const byTarget = new Map<string, Array<{ at: number; ok: boolean; latencyMs?: number }>>();
    for (const row of history) {
      const target = String(row.target);
      const list = byTarget.get(target) ?? [];
      list.push({
        at: Number(row.at),
        ok: Number(row.ok) === 1,
        latencyMs: row.latency_ms === null ? undefined : Number(row.latency_ms),
      });
      byTarget.set(target, list);
    }

    const checks = latest.map((row) => ({
      at: Number(row.at),
      target: String(row.target),
      category: String(row.category) as CheckResult["category"],
      label: String(row.label),
      ok: Number(row.ok) === 1,
      httpStatus: row.http_status === null ? undefined : Number(row.http_status),
      latencyMs: row.latency_ms === null ? undefined : Number(row.latency_ms),
      detail: row.detail === null ? undefined : String(row.detail),
      data: row.data === null ? undefined : safeParse(String(row.data)),
      history: byTarget.get(String(row.target)) ?? [],
    }));

    const events = sql.exec(
      "SELECT at, kind, target, summary, detail FROM events ORDER BY at DESC, id DESC LIMIT 60",
    ).toArray().map((row) => ({
      at: Number(row.at), kind: String(row.kind), target: String(row.target),
      summary: String(row.summary), detail: row.detail === null ? undefined : String(row.detail),
    }));

    const runs = sql.exec(
      "SELECT started_at, finished_at, ok_count, fail_count FROM runs WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 60",
    ).toArray().map((row) => ({
      at: Number(row.finished_at),
      ms: Number(row.finished_at) - Number(row.started_at),
      ok: Number(row.ok_count),
      failed: Number(row.fail_count),
    })).reverse();

    const trustSummary = this.snapshot<{
      total: number; issuers: number; verifiers: number; both: number;
      withAnchorClaim: number; registryError?: string;
    }>("trust-summary");
    const trustAt = Number(sql.exec("SELECT at FROM snapshots WHERE target = 'trust-summary'").toArray()[0]?.at ?? 0);
    const self = this.snapshot<{ didKey: string; onOfficialList: boolean; reason?: string }>("self-trust");
    const chain = this.snapshot<{
      counts: Record<ChainVerdict, number>;
      problems: Array<{ did: string; name?: string; verdict: ChainVerdict; reason?: string }>;
      blockNumber?: string; rpcOk: boolean; rpcError?: string; rpcEndpoint?: string; rpcTrail?: string[];
    }>("chain");
    const chainAt = Number(sql.exec("SELECT at FROM snapshots WHERE target = 'chain'").toArray()[0]?.at ?? 0);

    const census = this.snapshot<DashboardPayload["census"]>("status-census");

    return {
      census,
      lastRunAt: await this.lastRunAt(),
      lastRunMs: runs.at(-1)?.ms,
      running: false,
      schedule: "每天 UTC 02:00（臺灣時間 10:00）自動掃描一次",
      checks,
      trust: trustSummary ? { at: trustAt, ...trustSummary, self } : undefined,
      chain: chain ? {
        at: chainAt,
        verified: chain.counts.verified ?? 0,
        mismatch: chain.counts.mismatch ?? 0,
        notAnchored: chain.counts.notAnchored ?? 0,
        unavailable: chain.counts.unavailable ?? 0,
        blockNumber: chain.blockNumber,
        rpcOk: chain.rpcOk,
        rpcError: chain.rpcError,
        rpcEndpoint: chain.rpcEndpoint,
        rpcTrail: chain.rpcTrail,
        problems: chain.problems ?? [],
      } : undefined,
      events,
      runs,
    };
  }

  async recentEvents(limit = 50): Promise<MonitorEvent[]> {
    return this.sql().exec(
      "SELECT at, kind, target, summary, detail FROM events ORDER BY at DESC, id DESC LIMIT ?",
      Math.min(Math.max(limit, 1), 200),
    ).toArray().map((row) => ({
      at: Number(row.at), kind: String(row.kind), target: String(row.target),
      summary: String(row.summary), detail: row.detail === null ? undefined : String(row.detail),
    }));
  }
}

/** The hostname alone, so a keyed RPC URL never leaks its key. */
function safeHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "（無法解析的端點）";
  }
}

function safeParse(value: string): Record<string, JsonValue> | undefined {
  try {
    return JSON.parse(value) as Record<string, JsonValue>;
  } catch {
    return undefined;
  }
}
