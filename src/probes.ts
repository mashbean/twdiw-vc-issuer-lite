// What the monitor watches, and how each thing is probed.
//
// Every probe answers the same small question — is this reachable, how fast,
// and does the answer still have the shape the ecosystem depends on — and
// returns it in one uniform `CheckResult`. Shape matters as much as status: an
// endpoint that returns 200 with an empty or renamed field has broken every
// wallet that reads it, and a plain ping would call that healthy.
//
// Nothing here writes anything. The Durable Object stores the results.

import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { resolveDidKeyToJwk } from "./didkey";

export type CheckCategory = "api" | "chain" | "status-list" | "repo" | "e2e";

/** Values that survive the Durable Object RPC boundary.
 *
 *  Two constraints shaped this. `unknown` does not survive: the RPC type
 *  machinery cannot prove it serialisable and collapses the whole method's
 *  return type to `never`. A fully recursive JSON type does not survive either
 *  — resolving it through the stub exceeds TypeScript's instantiation depth. So
 *  the depth is bounded here at what the probes actually produce: scalars,
 *  arrays of scalars, and one level of object. */
export type JsonScalar = string | number | boolean | null | undefined;
export type JsonValue =
  | JsonScalar
  | JsonScalar[]
  | { [key: string]: JsonScalar }
  | Array<{ [key: string]: JsonScalar }>;

export interface CheckResult {
  /** Stable id, used as the key for history and diffing. */
  target: string;
  category: CheckCategory;
  label: string;
  ok: boolean;
  httpStatus?: number;
  latencyMs?: number;
  /** One person-readable line, in the page's language. */
  detail?: string;
  /** Structured extras the dashboard renders and the differ compares. */
  data?: Record<string, JsonValue>;
}

/** Whose infrastructure this is. The dashboard exists to watch the official
 *  ecosystem; this project's own services are shown for completeness and are
 *  visually recessed so they never compete with what matters. */
export type Tier = "official" | "own";

export interface EndpointTarget {
  id: string;
  label: string;
  url: string;
  /** Where this endpoint sits in the ecosystem, shown as a column. */
  operator: string;
  tier: Tier;
  method?: "GET" | "POST";
  body?: string;
  /** Returns a problem string when the body is reachable but the wrong shape. */
  expect?: (body: unknown) => string | null;
  /** An endpoint whose failure is informational rather than an outage. */
  informational?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** The endpoints the Taiwan wallet ecosystem actually depends on, plus this
 *  site's own. Anything added here appears on the dashboard automatically. */
export function endpointTargets(selfOrigin: string): EndpointTarget[] {
  return [
    {
      id: "official-trust-api",
      label: "官方信任清單 API",
      operator: "數位發展部",
      tier: "official",
      url: "https://frontend.wallet.gov.tw/api/did?size=20&page=0&orgType=1&status=1",
      expect: (body) => {
        const data = asRecord(asRecord(body)?.data);
        return Array.isArray(data?.dids) ? null : "回應沒有 data.dids 陣列";
      },
    },
    {
      id: "official-apply-catalog",
      label: "官方申請新卡目錄",
      operator: "數位發展部",
      tier: "official",
      url: "https://frontend.wallet.gov.tw/api/moda/dwapp/apply/vcList?name=&page=0&size=50",
      expect: (body) => {
        const data = asRecord(asRecord(body)?.data);
        return Array.isArray(data?.vcItems) ? null : "回應沒有 data.vcItems 陣列";
      },
    },
    {
      id: "official-wallet-site",
      label: "數位憑證皮夾官網",
      operator: "數位發展部",
      tier: "official",
      url: "https://wallet.gov.tw/",
      // The site refuses datacentre traffic (403 to this Worker and to a plain
      // curl from a laptop alike). That is bot protection, not an outage, so it
      // is recorded as an observation instead of a daily red alarm.
      informational: true,
    },
    {
      id: "demo-sandbox-issuer",
      label: "官方沙盒發行端",
      operator: "數位發展部（沙盒）",
      tier: "official",
      url: "https://issuer-oid4vci.wallet.gov.tw/",
      // The sandbox has no documented public landing path, so any HTTP answer
      // proves it is up. Marked informational so a 404 is not read as an outage.
      informational: true,
    },
    {
      id: "verifier-mashbean",
      label: "請出示皮夾（查驗端）",
      operator: "mashbean",
      tier: "own",
      url: "https://verifier.mashbean.net/api/profiles",
      expect: (body) => Array.isArray(asRecord(body)?.profiles) ? null : "回應沒有 profiles 陣列",
    },
    {
      id: "issuer-self-metadata",
      label: "請收下卡片（本站發行端）",
      operator: "mashbean",
      tier: "own",
      url: `${selfOrigin}/.well-known/openid-credential-issuer`,
      expect: (body) => typeof asRecord(body)?.credential_endpoint === "string"
        ? null
        : "metadata 沒有 credential_endpoint",
    },
    {
      id: "vct-metadata",
      label: "有備而來 vct 型別中繼資料",
      operator: "bonds-tw",
      tier: "own",
      url: "https://bonds-tw.github.io/vct/index.json",
      informational: true,
    },
  ];
}

/** The only revocation register named by hand: this site's own. Every official
 *  register is discovered instead — see `catalogue.ts`, which asks each
 *  registered issuer what it issues and reads the register beside each type. */
export function statusListTargets(selfOrigin: string): Array<{ id: string; label: string; url: string; operator: string; tier: Tier }> {
  return [
    {
      id: "status-self",
      label: "本站模擬卡撤銷清單",
      operator: "mashbean",
      tier: "own",
      url: `${selfOrigin}/status/1`,
    },
  ];
}

export const WATCHED_REPOS: Array<{ id: string; owner: string; repo: string; label: string; tier: Tier }> = [
  // The official ones first: the wallet app people install, the ecosystem
  // repository, and the DID work the trust list rests on.
  { id: "repo-official-app", owner: "moda-gov-tw", repo: "TWDIW-official-app", label: "官方皮夾 App", tier: "official" },
  { id: "repo-twdiw", owner: "moda-gov-tw", repo: "TW-DIW", label: "官方 TW-DIW", tier: "official" },
  { id: "repo-tw-did", owner: "moda-gov-tw", repo: "tw-did", label: "官方 tw-did", tier: "official" },
  { id: "repo-verifier", owner: "mashbean", repo: "twdiw-vp-verifier-lite", label: "請出示皮夾", tier: "own" },
  { id: "repo-issuer", owner: "mashbean", repo: "twdiw-vc-issuer-lite", label: "請收下卡片", tier: "own" },
  { id: "repo-wallet", owner: "bonds-tw", repo: "Bonds-iOS", label: "有備而來 皮夾", tier: "own" },
  { id: "repo-site", owner: "bonds-tw", repo: "bonds-tw.github.io", label: "有備而來 網站與 vct", tier: "own" },
];

// ── HTTP endpoint probe ─────────────────────────────────────────────────

export async function probeEndpoint(
  target: EndpointTarget,
  fetcher: typeof fetch = fetch,
): Promise<CheckResult> {
  const started = Date.now();
  try {
    const response = await fetcher(target.url, {
      method: target.method ?? "GET",
      headers: { accept: "application/json, text/html;q=0.8, */*;q=0.5" },
      ...(target.body ? { body: target.body, headers: { "content-type": "application/json" } } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return {
        target: target.id, category: "api", label: target.label,
        ok: Boolean(target.informational), httpStatus: response.status, latencyMs,
        detail: `HTTP ${response.status}`,
        data: { operator: target.operator, url: target.url, tier: target.tier },
      };
    }
    if (target.expect) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        return {
          target: target.id, category: "api", label: target.label,
          ok: false, httpStatus: response.status, latencyMs, detail: "回應不是 JSON",
          data: { operator: target.operator, url: target.url, tier: target.tier },
        };
      }
      const problem = target.expect(parsed);
      if (problem) {
        return {
          target: target.id, category: "api", label: target.label,
          ok: false, httpStatus: response.status, latencyMs, detail: problem,
          data: { operator: target.operator, url: target.url, tier: target.tier },
        };
      }
    }
    return {
      target: target.id, category: "api", label: target.label,
      ok: true, httpStatus: response.status, latencyMs, detail: "正常",
      data: { operator: target.operator, url: target.url, tier: target.tier },
    };
  } catch (error) {
    return {
      target: target.id, category: "api", label: target.label,
      ok: Boolean(target.informational), latencyMs: Date.now() - started,
      // A Worker cannot tell a refused connection from an edge-level block, so
      // the wording stops at what is true: this vantage point could not reach it.
      detail: `從 Cloudflare 邊緣無法取得（${error instanceof Error ? error.message : "未知錯誤"}）`,
      data: { operator: target.operator, url: target.url, tier: target.tier, unreachable: true },
    };
  }
}

// ── status list ─────────────────────────────────────────────────────────

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Uint8Array.from(atob(normalized + pad), (character) => character.charCodeAt(0));
}

function countBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    let value = byte;
    while (value) {
      count += value & 1;
      value >>= 1;
    }
  }
  return count;
}

export interface StatusListFinding {
  issuer?: string;
  /** The header's own account of where its verifying key lives. The production
   *  lists carry `jku` + `kid: key-2`, a key that is not in the issuer's DID —
   *  the observation this row exists to keep visible. */
  jku?: string;
  kid?: string;
  /** True when the list arrived wrapped in `{"statusList": "<jwt>"}`, which is
   *  what the production endpoints actually serve. */
  enveloped?: boolean;
  /** Whether the signing key is the one embedded in the issuer's own `did:key`.
   *  Measured on the production lists: it is not, which is why this is tracked
   *  as a standing observation rather than assumed. */
  keyInIssuerDid?: boolean;
  signatureVerified: boolean;
  subjectMatchesUrl?: boolean;
  totalBits?: number;
  revokedBits?: number;
  expiresAt?: number;
  issuedAt?: number;
  format?: "statuslist2021" | "token-status-list";
}

export async function probeStatusList(
  target: { id: string; label: string; url: string; operator: string; tier: Tier },
  fetcher: typeof fetch = fetch,
): Promise<CheckResult> {
  const started = Date.now();
  const base = { target: target.id, category: "status-list" as const, label: target.label };
  try {
    const response = await fetcher(target.url, {
      headers: { accept: "application/jwt, application/statuslist+jwt, application/vc+jwt, */*" },
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { ...base, ok: false, httpStatus: response.status, latencyMs, detail: `HTTP ${response.status}`,
               data: { operator: target.operator, url: target.url } };
    }
    const raw = (await response.text()).trim();
    const finding: StatusListFinding = { signatureVerified: false };
    // The production endpoints serve `{"statusList":"<jwt>"}` rather than a bare
    // JWT; the spec's own media type implies the latter, so accept both.
    let token = raw;
    if (raw.startsWith("{")) {
      try {
        const envelope = JSON.parse(raw) as Record<string, unknown>;
        const inner = ["statusList", "status_list", "token", "jwt"]
          .map((key) => envelope[key])
          .find((value) => typeof value === "string" && value.split(".").length === 3);
        if (typeof inner === "string") {
          token = inner;
          finding.enveloped = true;
        }
      } catch {
        // Fall through: the JWT parse below reports it as unreadable.
      }
    }

    let payload: Record<string, unknown>;
    try {
      const header = decodeProtectedHeader(token) as { jku?: string; kid?: string };
      finding.jku = header.jku;
      finding.kid = header.kid;
      payload = decodeJwt(token) as Record<string, unknown>;
    } catch {
      return { ...base, ok: false, httpStatus: response.status, latencyMs, detail: "回應不是可解析的 JWT",
               data: { operator: target.operator, url: target.url } };
    }
    finding.issuer = typeof payload.iss === "string" ? payload.iss : undefined;
    finding.issuedAt = typeof payload.iat === "number" ? payload.iat : undefined;
    finding.expiresAt = typeof payload.exp === "number" ? payload.exp : undefined;
    finding.subjectMatchesUrl = typeof payload.sub === "string" ? payload.sub === target.url : undefined;

    // The signature, checked against the key the issuer's own DID carries. A
    // did:key is self-certifying, so this is the only offline-checkable anchor
    // a wallet has for revocation — and where it fails, that is the finding.
    if (finding.issuer?.startsWith("did:key:")) {
      const jwk = resolveDidKeyToJwk(finding.issuer);
      if (jwk) {
        try {
          await jwtVerify(token, await importJWK(jwk as JWK, "ES256") as never);
          finding.signatureVerified = true;
          finding.keyInIssuerDid = true;
        } catch {
          finding.keyInIssuerDid = false;
        }
      } else {
        finding.keyInIssuerDid = false;
      }
    }

    // The bitstring, in whichever of the two profiles this list uses.
    const vc = payload.vc as Record<string, unknown> | undefined;
    const subject = vc?.credentialSubject as Record<string, unknown> | undefined;
    const encodedList = typeof subject?.encodedList === "string" ? subject.encodedList : undefined;
    const statusList = payload.status_list as { bits?: number; lst?: string } | undefined;
    try {
      if (encodedList) {
        const bytes = await gunzip(base64ToBytes(encodedList));
        finding.format = "statuslist2021";
        finding.totalBits = bytes.length * 8;
        finding.revokedBits = countBits(bytes);
      } else if (statusList?.lst) {
        const bytes = await inflate(base64ToBytes(statusList.lst));
        finding.format = "token-status-list";
        finding.totalBits = (bytes.length * 8) / (statusList.bits ?? 1);
        finding.revokedBits = countBits(bytes);
      }
    } catch {
      // Leave the counts absent; the detail line below says the list body could
      // not be decompressed rather than reporting a false zero.
    }

    const problems: string[] = [];
    if (!finding.signatureVerified) {
      problems.push(finding.jku
        // A list that names an external key source is not broken; it is telling
        // us its verifying key is not in the issuer's DID, which is precisely
        // what an offline wallet cannot check.
        ? `簽章金鑰不在發行者 DID 內（header 指向 ${finding.kid ?? "外部金鑰"}）`
        : "簽章未能以發行者 DID 內的金鑰驗證");
    }
    if (finding.subjectMatchesUrl === false) problems.push("sub 與清單網址不符");
    if (finding.expiresAt && finding.expiresAt * 1000 < Date.now()) problems.push("清單已過期");
    if (finding.totalBits === undefined) problems.push("位元圖無法解壓");

    return {
      ...base,
      // Reachability and shape are the health signal. A signature that does not
      // verify against the issuer's DID is a real and *expected* finding on the
      // production lists, so it is reported in the detail rather than turned
      // into a red outage every single day.
      ok: response.ok && finding.totalBits !== undefined,
      httpStatus: response.status,
      latencyMs,
      detail: problems.length ? problems.join("；") : "正常",
      data: { operator: target.operator, url: target.url, tier: target.tier, ...finding },
    };
  } catch (error) {
    return {
      ...base, ok: false, latencyMs: Date.now() - started,
      detail: `無法取得（${error instanceof Error ? error.message : "未知錯誤"}）`,
      data: { operator: target.operator, url: target.url, tier: target.tier, unreachable: true },
    };
  }
}

// ── source repositories ─────────────────────────────────────────────────

/** Repository activity, which is not the same as health — it says when the code
 *  last moved, not whether it works. The page labels it that way. */
export async function probeRepo(
  entry: (typeof WATCHED_REPOS)[number],
  options: { token?: string; fetcher?: typeof fetch } = {},
): Promise<CheckResult> {
  const fetcher = options.fetcher ?? fetch;
  const started = Date.now();
  const base = { target: entry.id, category: "repo" as const, label: entry.label };
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "twdiw-vc-issuer-lite-monitor",
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  try {
    const response = await fetcher(`https://api.github.com/repos/${entry.owner}/${entry.repo}`, {
      headers, signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { ...base, ok: false, httpStatus: response.status, latencyMs,
               detail: response.status === 403
                 ? "GitHub 匿名配額用盡（Cloudflare 共用 IP 常被用完）；設定 GITHUB_TOKEN secret 即可解決"
                 : `HTTP ${response.status}`,
               data: { owner: entry.owner, repo: entry.repo, tier: entry.tier } };
    }
    const body = await response.json() as {
      pushed_at?: string; open_issues_count?: number; stargazers_count?: number;
      default_branch?: string; archived?: boolean; license?: { spdx_id?: string };
    };
    const pushedAt = body.pushed_at ? Date.parse(body.pushed_at) : undefined;
    const days = pushedAt ? Math.floor((Date.now() - pushedAt) / 86_400_000) : undefined;
    return {
      ...base, ok: true, httpStatus: response.status, latencyMs,
      detail: days === undefined ? "已讀取" : days === 0 ? "今天有更新" : `${days} 天前更新`,
      data: {
        owner: entry.owner, repo: entry.repo, tier: entry.tier,
        url: `https://github.com/${entry.owner}/${entry.repo}`,
        pushedAt, openIssues: body.open_issues_count, stars: body.stargazers_count,
        defaultBranch: body.default_branch, archived: body.archived,
        license: body.license?.spdx_id,
      },
    };
  } catch (error) {
    return {
      ...base, ok: false, latencyMs: Date.now() - started,
      detail: `無法取得（${error instanceof Error ? error.message : "未知錯誤"}）`,
      data: { owner: entry.owner, repo: entry.repo, tier: entry.tier },
    };
  }
}
