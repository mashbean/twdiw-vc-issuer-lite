// A census of the ecosystem's credential types and their revocation registers.
//
// A status list URL is not published anywhere as a list; it lives inside each
// issued credential, under `vc.credentialStatus.statusListCredential`. That
// makes revocation the least visible part of the whole system: you cannot see
// how many cards have been revoked without holding one of them.
//
// It is discoverable, though, without holding anything. Every registered issuer
// publishes OID4VCI metadata naming its credential types, and each type's
// register sits at a predictable path beside it. So this walks the official
// trust list, asks each issuer what it issues, and reads every register it
// finds — turning a per-card secret into a published census.
//
// Measured 2026-09-09: 20 issuers, 62 registers, from a 公路局 driving licence
// with thousands of revocations down to university cards with none.

import type { JsonValue } from "./probes";
import type { TrustEntry } from "./trust";

/** Where an issuer's OID4VCI metadata sits, given its trust-list registration. */
export function metadataURL(serviceBaseURL: string, orgId: string): string {
  return `${serviceBaseURL.replace(/\/$/, "")}/oid4vci/api/issuer/${encodeURIComponent(orgId)}/.well-known/openid-credential-issuer`;
}

/** Where a credential type's revocation register sits. */
export function statusListURL(serviceBaseURL: string, credentialType: string): string {
  return `${serviceBaseURL.replace(/\/$/, "")}/vc/api/status-list/${encodeURIComponent(credentialType)}/r0`;
}

export interface CensusEntry {
  issuer: string;
  issuerId: string;
  credentialType: string;
  url: string;
  totalBits: number;
  revoked: number;
  /** The key the register is signed with, and whether it is the issuer's own
   *  DID key. Every production register measured so far says `key-2` and no. */
  kid?: string;
  keyInIssuerDid: boolean;
  subjectMatchesUrl: boolean;
}

export interface Census {
  at: number;
  issuersAsked: number;
  issuersAnswered: number;
  typesFound: number;
  entries: CensusEntry[];
  /** Registers found but unreadable, kept as a count so the census never
   *  quietly under-reports. */
  unreadable: number;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
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

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64ToBytes(segment))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Runs `tasks` a few at a time. Forty issuers and sixty registers once a day
 *  is a trivial load spread out, and a stampede nobody asked for if it is not. */
async function inBatches<T, R>(items: T[], size: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(...await Promise.all(items.slice(index, index + size).map(task)));
  }
  return out;
}

/** The credential types an issuer says it issues. */
async function credentialTypes(
  entry: { serviceBaseURL: string; orgId: string },
  fetcher: typeof fetch,
): Promise<string[] | null> {
  try {
    const response = await fetcher(metadataURL(entry.serviceBaseURL, entry.orgId), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as {
      credential_configurations_supported?: Record<string, unknown>;
      credentials_supported?: Record<string, unknown>;
    };
    const configs = body.credential_configurations_supported ?? body.credentials_supported;
    return configs ? Object.keys(configs) : null;
  } catch {
    return null;
  }
}

/** Reads one register and counts what it revokes. */
async function readRegister(
  url: string,
  fetcher: typeof fetch,
): Promise<Omit<CensusEntry, "issuer" | "issuerId" | "credentialType" | "url"> | null> {
  try {
    const response = await fetcher(url, {
      headers: { accept: "application/jwt, application/json, */*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const raw = (await response.text()).trim();
    // Production serves `{"statusList":"<jwt>"}`; the spec implies a bare JWT.
    let token = raw;
    if (raw.startsWith("{")) {
      try {
        const envelope = JSON.parse(raw) as Record<string, unknown>;
        const inner = ["statusList", "status_list", "token", "jwt"]
          .map((key) => envelope[key])
          .find((value) => typeof value === "string" && value.split(".").length === 3);
        if (typeof inner !== "string") return null;
        token = inner;
      } catch {
        return null;
      }
    }
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeSegment(parts[0]!);
    const payload = decodeSegment(parts[1]!);
    if (!payload) return null;
    const vc = payload.vc as { credentialSubject?: { encodedList?: unknown } } | undefined;
    const encoded = vc?.credentialSubject?.encodedList;
    if (typeof encoded !== "string") return null;
    const bytes = await gunzip(base64ToBytes(encoded));
    // Every production register measured names an external key (`jku` + a `kid`
    // that is not in the issuer's DID). Recorded rather than assumed, since it
    // is the one thing an offline wallet cannot check for itself.
    const kid = typeof header?.kid === "string" ? header.kid : undefined;
    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    return {
      totalBits: bytes.length * 8,
      revoked: countBits(bytes),
      kid,
      keyInIssuerDid: Boolean(kid && issuer.startsWith("did:key:") && kid.startsWith(issuer)),
      subjectMatchesUrl: payload.sub === url,
    };
  } catch {
    return null;
  }
}

/** Walks the trust list, asks every issuer what it issues, and reads each
 *  register. Bounded so a registry that grows tenfold cannot turn one daily
 *  scan into thousands of requests. */
export async function takeCensus(
  entries: TrustEntry[],
  options: { fetcher?: typeof fetch; maxRegisters?: number } = {},
): Promise<Census> {
  const fetcher = options.fetcher ?? fetch;
  const maxRegisters = options.maxRegisters ?? 150;

  const issuers = entries
    .filter((entry) => entry.orgTypes.includes(1) && entry.serviceBaseURL && entry.taxId)
    .map((entry) => ({
      name: entry.name,
      orgId: entry.taxId!,
      serviceBaseURL: entry.serviceBaseURL!,
    }));

  const discovered = await inBatches(issuers, 6, async (issuer) => ({
    issuer,
    types: await credentialTypes(issuer, fetcher),
  }));

  const targets: Array<{ issuer: typeof issuers[number]; credentialType: string; url: string }> = [];
  for (const { issuer, types } of discovered) {
    for (const credentialType of types ?? []) {
      if (targets.length >= maxRegisters) break;
      targets.push({ issuer, credentialType, url: statusListURL(issuer.serviceBaseURL, credentialType) });
    }
  }

  const results = await inBatches(targets, 6, async (target) => ({
    target,
    register: await readRegister(target.url, fetcher),
  }));

  const census: CensusEntry[] = [];
  let unreadable = 0;
  for (const { target, register } of results) {
    if (!register) {
      unreadable += 1;
      continue;
    }
    census.push({
      issuer: target.issuer.name,
      issuerId: target.issuer.orgId,
      credentialType: target.credentialType,
      url: target.url,
      ...register,
    });
  }
  census.sort((left, right) => right.revoked - left.revoked || left.issuer.localeCompare(right.issuer));

  return {
    at: Date.now(),
    issuersAsked: issuers.length,
    issuersAnswered: discovered.filter((item) => item.types !== null).length,
    typesFound: targets.length,
    entries: census,
    unreadable,
  };
}

export function totalRevoked(census: Census): number {
  return census.entries.reduce((sum, entry) => sum + entry.revoked, 0);
}

/** The census as a plain payload for storage and for the page. */
export function censusPayload(census: Census): Record<string, JsonValue> {
  return {
    at: census.at,
    issuersAsked: census.issuersAsked,
    issuersAnswered: census.issuersAnswered,
    typesFound: census.typesFound,
    unreadable: census.unreadable,
    totalRevoked: totalRevoked(census),
    entries: census.entries.map((entry) => ({ ...entry })),
  };
}
