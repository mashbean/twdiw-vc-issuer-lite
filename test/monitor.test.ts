// The probes, the feeds and the dashboard shell.
//
// The probes are where the monitor's honesty lives: an endpoint that answers
// 200 with the wrong shape must be reported as broken, an unreachable host must
// be described as unreachable-from-here rather than down, and a status list
// whose signature does not verify against the issuer's own DID must say so
// without being turned into a daily red alarm.

import { describe, expect, it, vi } from "vitest";
import { atomFeed, jsonFeed } from "../src/feed";
import { MONITOR_CSS, MONITOR_HTML, MONITOR_JS } from "../src/monitor-frontend";
import { describeRoles, describeVerdict } from "../src/monitor-wording";
import { looksLikeTestCard } from "../src/catalogue";
import {
  WATCHED_REPOS,
  endpointTargets,
  probeEndpoint,
  probeRepo,
  probeStatusList,
  statusListTargets,
} from "../src/probes";
import { jwkJcsPubDidKey } from "../src/didkey";
import { b64url, type Signer } from "../src/sdjwt";
import { statusListJwt } from "../src/statuslist";

const ORIGIN = "https://issuer.test";

async function testSigner(): Promise<Signer> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
  return {
    didKey: jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: publicJwk.x!, y: publicJwk.y! }),
    async sign(input) {
      return b64url(new Uint8Array(await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(input),
      )));
    },
  };
}

function respondWith(body: string, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

describe("what the monitor watches", () => {
  it("covers both ends of the ecosystem and this site itself", () => {
    const ids = endpointTargets(ORIGIN).map((target) => target.id);
    expect(ids).toContain("official-trust-api");
    expect(ids).toContain("official-apply-catalog");
    expect(ids).toContain("verifier-mashbean");
    expect(ids).toContain("issuer-self-metadata");
    // The self target must follow the deployment, not a hardcoded demo host.
    const self = endpointTargets(ORIGIN).find((target) => target.id === "issuer-self-metadata");
    expect(self?.url.startsWith(ORIGIN)).toBe(true);
    // The production revocation registers come first; this site's own list is
    // the recessed one at the end.
    // Official registers are discovered by the census, not named by hand; the
    // only hand-written one is this site's own.
    const lists = statusListTargets(ORIGIN);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.url).toBe(`${ORIGIN}/status/1`);
    expect(lists[0]?.tier).toBe("own");
    expect(WATCHED_REPOS.filter((repo) => repo.owner === "moda-gov-tw").length).toBeGreaterThanOrEqual(2);
    // A private repository can only ever 404 for a public monitor.
    expect(WATCHED_REPOS.some((repo) => repo.repo === "TW-DIW")).toBe(false);
    expect(WATCHED_REPOS.map((repo) => repo.repo)).toContain("TWDIW-official-app");
  });
});

describe("endpoint probing", () => {
  const target = endpointTargets(ORIGIN).find((item) => item.id === "official-trust-api")!;

  it("passes an endpoint whose body still has the shape wallets depend on", async () => {
    const result = await probeEndpoint(target, respondWith(JSON.stringify({ data: { dids: [] } })));
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("fails a 200 whose shape changed, which a plain ping would call healthy", async () => {
    const result = await probeEndpoint(target, respondWith(JSON.stringify({ data: { records: [] } })));
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/data\.dids/);
  });

  it("fails a 200 that is not JSON at all", async () => {
    const result = await probeEndpoint(target, respondWith("<html>維護中</html>"));
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/不是 JSON/);
  });

  it("describes an unreachable host as unreachable from here, not as down", async () => {
    const fetcher = vi.fn(async () => { throw new Error("connection refused"); }) as unknown as typeof fetch;
    const result = await probeEndpoint(target, fetcher);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/從 Cloudflare 邊緣無法取得/);
    expect(result.data?.unreachable).toBe(true);
  });

  it("keeps an informational target green on a 404, since it has no documented path", async () => {
    const sandbox = endpointTargets(ORIGIN).find((item) => item.id === "demo-sandbox-issuer")!;
    const result = await probeEndpoint(sandbox, respondWith("nope", { status: 404 }));
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("HTTP 404");
  });
});

describe("status list probing", () => {
  const target = { id: "status-self", label: "本站撤銷清單", url: `${ORIGIN}/status/1`, operator: "mashbean", tier: "own" as const };

  it("reads the bitstring and confirms the key is the one inside the issuer DID", async () => {
    const signer = await testSigner();
    const token = await statusListJwt(signer, { listUrl: target.url, revoked: [3, 9] });
    const result = await probeStatusList(target, respondWith(token));
    expect(result.ok).toBe(true);
    expect(result.data?.keyInIssuerDid).toBe(true);
    expect(result.data?.signatureVerified).toBe(true);
    expect(result.data?.subjectMatchesUrl).toBe(true);
    expect(result.data?.revokedBits).toBe(2);
    expect(result.data?.format).toBe("statuslist2021");
    expect(result.detail).toBe("正常");
  });

  it("reports a list signed by a key that is not in the issuer's DID, without calling it an outage", async () => {
    // The measured production behaviour: the DID publishes one key and the
    // status list is signed by another. Reachable and decodable, so `ok` stays
    // true; the finding is carried in the detail and the flag.
    const issuer = await testSigner();
    const stranger = await testSigner();
    const token = await statusListJwt(
      { didKey: issuer.didKey, sign: stranger.sign }, { listUrl: target.url, revoked: [] },
    );
    const result = await probeStatusList(target, respondWith(token));
    expect(result.ok).toBe(true);
    expect(result.data?.keyInIssuerDid).toBe(false);
    expect(result.detail).toMatch(/簽章未能以發行者 DID 內的金鑰驗證/);
  });

  it("notices a list whose sub does not match the URL it was served from", async () => {
    const signer = await testSigner();
    const token = await statusListJwt(signer, { listUrl: "https://elsewhere.test/status/1", revoked: [] });
    const result = await probeStatusList(target, respondWith(token));
    expect(result.data?.subjectMatchesUrl).toBe(false);
    expect(result.detail).toMatch(/sub 與清單網址不符/);
  });

  it("fails an unreachable or non-JWT list", async () => {
    expect((await probeStatusList(target, respondWith("nope", { status: 503 }))).ok).toBe(false);
    const notAJwt = await probeStatusList(target, respondWith("plain text"));
    expect(notAJwt.ok).toBe(false);
    expect(notAJwt.detail).toMatch(/不是可解析的 JWT/);
  });
});

describe("repository activity", () => {
  it("reports how long ago the code last moved", async () => {
    const pushedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const fetcher = respondWith(JSON.stringify({
      pushed_at: pushedAt, open_issues_count: 4, stargazers_count: 12,
      default_branch: "main", license: { spdx_id: "GPL-3.0-only" },
    }));
    const result = await probeRepo(WATCHED_REPOS[0]!, { fetcher });
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("3 天前更新");
    expect(result.data?.openIssues).toBe(4);
    expect(result.data?.license).toBe("GPL-3.0-only");
  });

  it("names the rate limit rather than reporting a mystery failure", async () => {
    const result = await probeRepo(WATCHED_REPOS[0]!, { fetcher: respondWith("", { status: 403 }) });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/配額/);
  });
});

describe("wording shared by the dashboard", () => {
  it("names roles and verdicts in the page's language", () => {
    expect(describeRoles([1])).toBe("發行者");
    expect(describeRoles([1, 2])).toBe("發行者＋驗證者");
    expect(describeRoles([])).toBe("未標示");
    expect(describeVerdict("verified")).toBe("鏈上一致");
    expect(describeVerdict("mismatch")).toBe("與鏈上不符");
    expect(describeVerdict("notAnchored")).toBe("未上鏈");
  });
});

describe("telling a real card from a scratch one", () => {
  it("flags the production registry's internal test cards by the issuer's own naming", () => {
    // moda keeps these beside the real ones on production infrastructure.
    expect(looksLikeTestCard("2-16-886-101-20003-20082_sheep", "sheep")).toBe(true);
    expect(looksLikeTestCard("2-16-886-101-20003-20082_test0417", "test0417")).toBe(true);
    expect(looksLikeTestCard("2-16-886-101-20003-20082_driver_license_1212", "記者會駕照驗證卡")).toBe(true);
    expect(looksLikeTestCard("2-16-886-101-20003-20082_test_degree_certificate_070701", "測試大學學位證書")).toBe(true);
  });

  it("leaves the citizen-facing cards alone", () => {
    expect(looksLikeTestCard("2-16-886-101-20003-20008-20082_driverlicense_car_1211", "汽車駕照")).toBe(false);
    expect(looksLikeTestCard("97176270_twmdiwvc_postpaid", "台灣大哥大門號電子卡")).toBe(false);
    expect(looksLikeTestCard("2-16-886-101-20003-20082_visitor_card", "數位發展部訪客卡")).toBe(false);
  });
});

describe("the census keeps the flagship card", () => {
  it("still names the driving licence when 公路局's metadata will not answer", async () => {
    const { takeCensus } = await import("../src/catalogue");
    // Metadata refused, registers reachable — the shape seen from Cloudflare.
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(".well-known/openid-credential-issuer")) return new Response("no", { status: 403 });
      return new Response("not a register", { status: 404 });
    }) as unknown as typeof fetch;
    const census = await takeCensus([{
      did: "did:key:zRoad", name: "行政院-交通部-公路局", orgTypes: [1], hosts: [],
      taxId: "2-16-886-101-20003-20008-20082",
      serviceBaseURL: "https://03711905.wallet.gov.tw",
      onChain: true, registrations: [],
    }], { fetcher });
    // The registers were unreachable in this fixture, so nothing is counted —
    // but the types were still discovered, which is what the seed is for.
    expect(census.typesFound).toBe(2);
    expect(census.issuersAnswered).toBe(0);
  });
});

describe("feeds", () => {
  const events = [
    { at: 1_757_000_000_000, kind: "trust-added", target: "trust-list", summary: "信任清單新增：某某機關", detail: "did:key:zAbc" },
    { at: 1_756_900_000_000, kind: "down", target: "official-trust-api", summary: "官方信任清單 API 異常" },
  ];

  it("publishes only changes, with stable ids", () => {
    const feed = JSON.parse(jsonFeed(ORIGIN, events)) as { items: Array<{ id: string; title: string }> };
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]!.title).toMatch(/信任清單新增/);
    expect(new Set(feed.items.map((item) => item.id)).size).toBe(2);
    expect(jsonFeed(ORIGIN, events)).toBe(jsonFeed(ORIGIN, events));
  });

  it("escapes XML so a hostile organisation name cannot break the Atom feed", () => {
    const hostile = [{ at: 1, kind: "trust-added", target: "t", summary: `<script>&"'`, detail: "x" }];
    const xml = atomFeed(ORIGIN, hostile);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&amp;");
    expect(xml.startsWith("<?xml")).toBe(true);
  });
});

describe("the dashboard page", () => {
  it("keeps every element id the script drives", () => {
    for (const id of [
      "last-scan", "schedule", "refresh", "refresh-note", "load-error",
      "cell-api", "cell-e2e", "cell-trust", "cell-status", "cell-chain", "cell-repo",
      "table-api", "e2e-body", "trust-body", "trust-self", "trust-accepted", "trust-table", "trust-meta",
      "census-summary", "table-census", "census-meta", "panel-own-trust",
      "table-status", "chain-body", "table-repo", "timeline",
      "cell-own-api", "cell-own-repo", "table-own-api", "table-own-repo",
    ]) {
      expect(MONITOR_HTML, id).toContain(`id="${id}"`);
    }
  });

  it("loads its own stylesheet on top of the shared one and offers both feeds", () => {
    expect(MONITOR_HTML).toContain('<link rel="stylesheet" href="/app.css">');
    expect(MONITOR_HTML).toContain('<link rel="stylesheet" href="/monitor.css">');
    expect(MONITOR_HTML).toContain('<script src="/monitor.js" defer></script>');
    expect(MONITOR_HTML).toContain('href="/monitor/feed.json"');
    expect(MONITOR_HTML).toContain('href="/monitor/feed.xml"');
    expect(MONITOR_CSS).toContain(".status-strip");
    expect(MONITOR_CSS).toContain(".timeline");
  });

  it("states the boundaries the data cannot cross", () => {
    expect(MONITOR_HTML).toContain("從 Cloudflare 邊緣單點觀測");
    expect(MONITOR_HTML).toContain("沒有回應或路徑不同的發行者不在其中");
    expect(MONITOR_HTML).toContain("沒有憑證到期監測");
    expect(MONITOR_HTML).toContain("每天掃一次");
    expect(MONITOR_HTML).toContain("不在官方信任清單上");
  });

  it("keeps the trust list on the page instead of sending the reader elsewhere", () => {
    expect(MONITOR_JS).toContain("fetch('/api/trust-list'");
    expect(MONITOR_HTML).toContain("完整清單就在這裡");
    expect(MONITOR_HTML).not.toContain('href="/#trust"');
  });

  it("publishes the revocation census rather than a hand-picked sample", () => {
    expect(MONITOR_HTML).toContain("沒有任何地方公告它們");
    expect(MONITOR_HTML).toContain("vc.credentialStatus.statusListCredential");
    expect(MONITOR_JS).toContain("renderCensus");
    expect(MONITOR_JS).toContain("已撤銷卡片總數");
  });

  it("keeps this project's own services in a separate block from the official ecosystem", () => {
    expect(MONITOR_HTML).toContain('class="official-block"');
    expect(MONITOR_HTML).toContain('class="own-block"');
    expect(MONITOR_HTML).toContain("官方生態系");
    expect(MONITOR_HTML).toContain("本專案（有備而來與 mashbean）");
    expect(MONITOR_CSS).toContain(".own-block");
    // The official tables must never carry an own-tier row, and vice versa.
    expect(MONITOR_JS).toContain("c.data.tier!=='own'");
    expect(MONITOR_JS).toContain("c.data.tier==='own'");
    // The official trust-list panel carries the register and nothing about this
    // project: the self-assessment lives in the own block.
    const official = MONITOR_HTML.slice(MONITOR_HTML.indexOf('class="official-block"'), MONITOR_HTML.indexOf('class="own-block"'));
    expect(official).toContain('id="trust-table"');
    expect(official).not.toContain('id="trust-self"');
    expect(official).not.toContain('id="trust-accepted"');
    expect(official).not.toContain("有備而來");
    // Nor any other way of talking about this site inside the official panel.
    expect(MONITOR_JS).not.toContain("'本站自身：'");
  });

  it("reads its data from the same origin and never polls", () => {
    expect(MONITOR_JS).toContain("fetch('/api/monitor'");
    expect(MONITOR_JS).toContain("/api/monitor/refresh");
    expect(MONITOR_JS).not.toContain("setInterval");
    // No cross-origin request: every fetch is a same-origin path. (The one
    // `http://` in the file is the SVG namespace URI, which is an identifier,
    // not an address anything is fetched from.)
    expect(MONITOR_JS).not.toMatch(/fetch\(['"`]https?:/);
  });
});
