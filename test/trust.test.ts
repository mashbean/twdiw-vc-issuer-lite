import { describe, expect, it, vi } from "vitest";
import { fetchOfficialTrustList, mergeTrustEntries, officialTrustFor, parseTrustPage } from "../src/trust";

const REGISTRY = "https://registry.test/api/did";

function record(id: string, orgType: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    orgType,
    status: 1,
    org: { name: `機關 ${id}`, name_en: `Org ${id}`, taxId: "12345678", issuerMetadataBaseURL: `https://${id.slice(8).toLowerCase()}.example/oid4vci`, ...extra },
    onChainHistory: [{ net: "arbitrum", scAddress: "0xabc", txHash: "0xdef", status: 1 }],
  };
}

describe("parsing an official trust-list page", () => {
  it("reads the list shape and the single-record shape", () => {
    const list = parseTrustPage({ code: "0", data: { dids: [record("did:key:zA", 1), record("did:key:zB", 2)] } });
    expect(list.map((entry) => entry.did)).toEqual(["did:key:zA", "did:key:zB"]);
    expect(list[0].hosts).toEqual(["za.example"]);
    expect(list[0].onChain).toBe(true);
    expect(list[0].network).toBe("arbitrum");
    const single = parseTrustPage({ code: "0", data: record("did:key:zC", 1) });
    expect(single.length).toBe(1);
    expect(parseTrustPage({ code: "0", data: {} })).toEqual([]);
    expect(parseTrustPage(null)).toEqual([]);
  });

  it("merges an organisation registered under both org types into one row", () => {
    const merged = mergeTrustEntries([
      ...parseTrustPage({ data: { dids: [record("did:key:zA", 1)] } }),
      ...parseTrustPage({ data: { dids: [record("did:key:zA", 2, { serviceBaseURL: "https://verify.a.example" })] } }),
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].orgTypes).toEqual([1, 2]);
    expect(merged[0].hosts).toEqual(["za.example", "verify.a.example"]);
    expect(merged[0].serviceBaseURL).toBe("https://verify.a.example");
  });
});

describe("paging the official API", () => {
  it("asks for 20 per page from page 0, for both org types, until a page is empty", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url.search);
      const page = Number(url.searchParams.get("page"));
      const orgType = Number(url.searchParams.get("orgType"));
      const dids = orgType === 1 && page < 2 ? [record(`did:key:z${orgType}-${page}`, orgType)]
        : orgType === 2 && page < 1 ? [record("did:key:z1-0", 2)] : [];
      return new Response(JSON.stringify({ code: "0", data: { dids } }), { status: 200 });
    }) as unknown as typeof fetch;
    const list = await fetchOfficialTrustList(REGISTRY, fetcher);
    expect(calls).toEqual([
      "?size=20&page=0&orgType=1&status=1",
      "?size=20&page=1&orgType=1&status=1",
      "?size=20&page=2&orgType=1&status=1",
      "?size=20&page=0&orgType=2&status=1",
      "?size=20&page=1&orgType=2&status=1",
    ]);
    expect(list.pagesFetched).toBe(5);
    expect(list.entries.map((entry) => entry.did).sort()).toEqual(["did:key:z1-0", "did:key:z1-1"]);
    expect(list.entries.find((entry) => entry.did === "did:key:z1-0")?.orgTypes).toEqual([1, 2]);
    expect(list.error).toBeUndefined();
  });

  it("reports an API failure instead of pretending the list is empty", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const list = await fetchOfficialTrustList(REGISTRY, fetcher);
    expect(list.entries).toEqual([]);
    expect(list.error).toMatch(/503/);
  });
});

describe("looking this site's own DID up", () => {
  it("answers 'not on the list' when the API has no such active record", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "1", data: null }), { status: 200 })) as unknown as typeof fetch;
    const verdict = await officialTrustFor("did:key:zSelf", REGISTRY, fetcher);
    expect(verdict.trusted).toBe(false);
    expect(verdict.registryURL).toBe(`${REGISTRY}/${encodeURIComponent("did:key:zSelf")}`);
    expect(verdict.reason).toMatch(/沒有這筆/);
  });

  it("recognises an active record with an on-chain transaction", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "0", data: record("did:key:zGov", 1) }), { status: 200 })) as unknown as typeof fetch;
    const verdict = await officialTrustFor("did:key:zGov", REGISTRY, fetcher);
    expect(verdict.trusted).toBe(true);
    expect(verdict.onChain).toBe(true);
    expect(verdict.organization).toBe("機關 did:key:zGov");
  });
});
