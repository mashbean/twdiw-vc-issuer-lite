// The official trust list, read for display and for one honest comparison.
//
// 數位發展部 publishes the registered issuers and verifiers of the 數位憑證皮夾
// ecosystem at `frontend.wallet.gov.tw/api/did`. Wallets gate collection on it
// (the 有備而來 wallet refuses an offer whose host is not on it), and the
// 請出示皮夾 verifier gates government cards on the per-DID lookup. This issuer
// is deliberately *not* on that list — it is a sandbox — and the page shows the
// list next to this site's own DID so the difference is visible rather than
// implied.
//
// Paging follows what the 有備而來 wallet measured (2026-08-16): the server
// clamps `size` to 20 while deriving the offset from the requested size, so
// ask for 20, start at page 0, continue until a page comes back empty, and do
// not trust any count field. Both `orgType` values are fetched; an organisation
// registered as both appears twice and is merged by DID.

import type { Registration } from "./chain";

export interface TrustEntry {
  did: string;
  name: string;
  nameEnglish?: string;
  taxId?: string;
  orgTypes: number[];
  issuerMetadataBaseURL?: string;
  serviceBaseURL?: string;
  hosts: string[];
  onChain: boolean;
  network?: string;
  contract?: string;
  transactionHash?: string;
  /** One entry per API row behind this DID. An organisation registered as both
   *  an issuer and a verifier has two, each with its own category values and
   *  its own anchoring transaction, and the chain check compares them
   *  separately — merging them would compare a row against another row's
   *  transaction. Carried for the monitor; the card page ignores it. */
  registrations: Registration[];
}

export interface TrustList {
  registry: string;
  fetchedAt: string;
  pagesFetched: number;
  entries: TrustEntry[];
  error?: string;
}

export const DEFAULT_OFFICIAL_TRUST_REGISTRY = "https://frontend.wallet.gov.tw/api/did";
const PAGE_SIZE = 20;
const MAX_PAGES_PER_TYPE = 25;
const CACHE_TTL_S = 600;

interface RawRecord {
  id?: unknown;
  /** The signed DID document the registry stores under its historical `did`
   *  property — one of the strings the registry contract was called with. */
  did?: unknown;
  orgType?: unknown;
  orgGroup?: unknown;
  status?: unknown;
  org?: { name?: unknown; name_en?: unknown; taxId?: unknown; issuerMetadataBaseURL?: unknown; serviceBaseURL?: unknown };
  onChainHistory?: Array<{ net?: unknown; scAddress?: unknown; txHash?: unknown; status?: unknown }>;
}

function hostOf(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** One API page → entries. Accepts both live shapes: a list at `data.dids`,
 *  or a single record at `data`. */
export function parseTrustPage(json: unknown): TrustEntry[] {
  const root = json as { data?: unknown } | undefined;
  const data = root?.data as { dids?: unknown; id?: unknown } | undefined;
  if (!data || typeof data !== "object") return [];
  const records: RawRecord[] = Array.isArray(data.dids)
    ? data.dids as RawRecord[]
    : typeof data.id === "string" ? [data as RawRecord] : [];
  return records.flatMap((record) => {
    if (typeof record.id !== "string" || !record.org || typeof record.org !== "object") return [];
    const chain = record.onChainHistory?.find((item) => Number(item.status) === 1
      && typeof item.txHash === "string" && typeof item.scAddress === "string");
    const issuerMetadataBaseURL = asString(record.org.issuerMetadataBaseURL);
    const serviceBaseURL = asString(record.org.serviceBaseURL);
    const hosts = [...new Set([hostOf(issuerMetadataBaseURL), hostOf(serviceBaseURL)].filter((host): host is string => !!host))];
    const registration: Registration = {
      did: record.id,
      orgType: typeof record.orgType === "number" ? record.orgType : 0,
      orgGroup: typeof record.orgGroup === "number" ? record.orgGroup : 0,
      signedDIDDocument: asString(record.did) ?? "",
      organisation: record.org,
      onChainRecords: (record.onChainHistory ?? []).flatMap((item) => {
        const net = asString(item.net);
        const scAddress = asString(item.scAddress);
        const txHash = asString(item.txHash);
        if (!net || !scAddress || !txHash) return [];
        return [{ net, scAddress, txHash, status: Number(item.status) }];
      }),
    };
    return [{
      did: record.id,
      registrations: [registration],
      name: asString(record.org.name) ?? "（未提供名稱）",
      nameEnglish: asString(record.org.name_en),
      taxId: asString(record.org.taxId),
      orgTypes: typeof record.orgType === "number" ? [record.orgType] : [],
      issuerMetadataBaseURL,
      serviceBaseURL,
      hosts,
      onChain: Boolean(chain),
      network: asString(chain?.net),
      contract: asString(chain?.scAddress),
      transactionHash: asString(chain?.txHash),
    }];
  });
}

/** Merge duplicate DIDs (an organisation listed under both org types). */
export function mergeTrustEntries(entries: TrustEntry[]): TrustEntry[] {
  const byDid = new Map<string, TrustEntry>();
  for (const entry of entries) {
    const existing = byDid.get(entry.did);
    if (!existing) {
      byDid.set(entry.did, {
        ...entry,
        orgTypes: [...entry.orgTypes],
        hosts: [...entry.hosts],
        registrations: [...entry.registrations],
      });
      continue;
    }
    existing.orgTypes = [...new Set([...existing.orgTypes, ...entry.orgTypes])].sort();
    existing.hosts = [...new Set([...existing.hosts, ...entry.hosts])];
    existing.registrations = [...existing.registrations, ...entry.registrations];
    existing.issuerMetadataBaseURL ??= entry.issuerMetadataBaseURL;
    existing.serviceBaseURL ??= entry.serviceBaseURL;
    existing.onChain ||= entry.onChain;
    existing.network ??= entry.network;
    existing.contract ??= entry.contract;
    existing.transactionHash ??= entry.transactionHash;
  }
  return [...byDid.values()];
}

export async function fetchOfficialTrustList(
  registry = DEFAULT_OFFICIAL_TRUST_REGISTRY,
  fetcher: typeof fetch = fetch,
): Promise<TrustList> {
  const base = registry.replace(/\/$/, "");
  const collected: TrustEntry[] = [];
  let pagesFetched = 0;
  try {
    for (const orgType of [1, 2]) {
      for (let page = 0; page < MAX_PAGES_PER_TYPE; page += 1) {
        const url = `${base}?size=${PAGE_SIZE}&page=${page}&orgType=${orgType}&status=1`;
        const response = await fetcher(url, {
          headers: { accept: "application/json", "cache-control": "no-cache" },
          signal: AbortSignal.timeout(8_000),
        });
        pagesFetched += 1;
        if (!response.ok) throw new Error(`官方信任 API 回應 ${response.status}`);
        const entries = parseTrustPage(await response.json());
        if (!entries.length) break;
        collected.push(...entries);
      }
    }
  } catch (error) {
    return {
      registry: base,
      fetchedAt: new Date().toISOString(),
      pagesFetched,
      entries: mergeTrustEntries(collected),
      error: error instanceof Error ? error.message : "官方信任 API 無法讀取",
    };
  }
  return { registry: base, fetchedAt: new Date().toISOString(), pagesFetched, entries: mergeTrustEntries(collected) };
}

/** The list, through the Worker cache so a busy page does not page the
 *  official API on every load. Falls back to a direct fetch where no cache
 *  exists (tests). */
export async function cachedOfficialTrustList(registry: string, fetcher: typeof fetch = fetch): Promise<TrustList> {
  const cacheKey = new Request(`https://trust-list.cache.invalid/${encodeURIComponent(registry)}`);
  const cache = typeof caches !== "undefined" ? caches.default : undefined;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.json() as TrustList;
  }
  const list = await fetchOfficialTrustList(registry, fetcher);
  if (cache && !list.error) {
    await cache.put(cacheKey, new Response(JSON.stringify(list), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_TTL_S}` },
    }));
  }
  return list;
}

export interface OfficialTrustVerdict {
  trusted: boolean;
  registryURL: string;
  organization?: string;
  onChain: boolean;
  reason?: string;
}

/** The per-DID lookup the 請出示皮夾 verifier performs, applied to any DID —
 *  including this site's own, whose honest answer is 「不在清單上」. */
export async function officialTrustFor(
  did: string,
  registry = DEFAULT_OFFICIAL_TRUST_REGISTRY,
  fetcher: typeof fetch = fetch,
): Promise<OfficialTrustVerdict> {
  const registryURL = `${registry.replace(/\/$/, "")}/${encodeURIComponent(did)}`;
  try {
    const response = await fetcher(registryURL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { trusted: false, registryURL, onChain: false, reason: `官方信任 API 回應 ${response.status}` };
    const envelope = await response.json() as { code?: unknown; data?: RawRecord };
    const record = envelope.data;
    if (String(envelope.code) !== "0" || record?.id !== did || Number(record.status) !== 1) {
      return { trusted: false, registryURL, onChain: false, reason: "官方信任 API 沒有這筆啟用中的 DID" };
    }
    const chain = record.onChainHistory?.find((item) => Number(item.status) === 1 && typeof item.txHash === "string");
    return { trusted: true, registryURL, onChain: Boolean(chain), organization: asString(record.org?.name) };
  } catch (error) {
    return { trusted: false, registryURL, onChain: false, reason: error instanceof Error ? `官方信任 API 無法確認：${error.message}` : "官方信任 API 無法確認" };
  }
}
