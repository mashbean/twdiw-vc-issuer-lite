// Independently checking the trust registry against Arbitrum.
//
// 數位發展部's DID API reports an `onChainHistory` for each registered
// organisation. That flag is the API's own claim about itself, so believing it
// verifies nothing. This module does what the 有備而來 wallet's
// `TWDIWOnChainVerifier` does: fetch the named transaction, confirm it really
// wrote this DID's registration with these values, and then ask the contract
// for the DID's *current* record so a replaced or revoked registration cannot
// be replayed as current.
//
// Ported from the Swift original, decoding rules and all. The two selectors and
// the contract address are the measured production values.

/** Public Arbitrum endpoints, in preference order.
 *
 *  Measured 2026-09-09: all four serve both calls this monitor makes, the
 *  transaction lookup included. Two that did not are deliberately absent —
 *  `rpc.ankr.com/arbitrum` now demands authentication and
 *  `arbitrum.blockpi.network` answered 521.
 *
 *  Order and policy both matter. Requests leave from Cloudflare's shared egress
 *  addresses, which the official endpoint rate-limits hard: an early version
 *  rotated away on the first 429, landed on a provider that refused the archive
 *  query, and reported every DID as unavailable. So each endpoint is retried on
 *  its own backoff ladder before the next is tried, and there are enough of them
 *  that a throttled morning is not a blank panel. */
export const ARBITRUM_RPCS = [
  "https://arb1.arbitrum.io/rpc",
  "https://1rpc.io/arb",
  "https://arbitrum-one.public.blastapi.io",
  "https://arbitrum-one-rpc.publicnode.com",
];
export const ARBITRUM_RPC = ARBITRUM_RPCS[0]!;
export const REGISTRY_CONTRACT = "0x84172caf8dd126c76f1fa8a2733ca3233264d31f";
export const REGISTRY_NETWORK = "arbitrum";
/** The registration method whose calldata carries the DID and its documents. */
const REGISTER_SELECTOR = "f6e0d282";
/** `getDocById(bytes)` — the current-state lookup. */
const CURRENT_RECORD_SELECTOR = "fba6fe49";

export type ChainVerdict = "verified" | "mismatch" | "notAnchored" | "unavailable";

export interface OnChainRecord {
  net: string;
  scAddress: string;
  txHash: string;
  status: number;
}

/** One API registration row, with everything the chain comparison needs. */
export interface Registration {
  did: string;
  orgType: number;
  orgGroup: number;
  signedDIDDocument: string;
  organisation: unknown;
  onChainRecords: OnChainRecord[];
}

export interface RegistryInput {
  did: string;
  signedDIDDocument: string;
  organisationJSON: string;
  orgType: number;
  orgGroup: number;
}

export interface CurrentRegistryRecord {
  signedDIDDocument: string;
  organisationJSON: string;
  orgType: number;
  orgGroup: number;
  revoked: boolean;
}

// ── hex / ABI primitives ────────────────────────────────────────────────

function bytesFromHex(value: string): Uint8Array | null {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function hexFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** A 32-byte word read as an integer, refusing anything that would not fit
 *  safely — the same bound the Swift original keeps, because every byte here
 *  arrived from the network. */
function abiInteger(bytes: Uint8Array, word: number, base = 0): number | null {
  const start = base + word * 32;
  if (start + 32 > bytes.length) return null;
  const slice = bytes.subarray(start, start + 32);
  for (let index = 0; index < 24; index += 1) if (slice[index] !== 0) return null;
  let value = 0;
  for (let index = 24; index < 32; index += 1) {
    value = value * 256 + slice[index]!;
    if (!Number.isSafeInteger(value)) return null;
  }
  return value;
}

function abiString(bytes: Uint8Array, headWord: number, base = 0, headWordCount = 6): string | null {
  const offset = abiInteger(bytes, headWord, base);
  if (offset === null || offset < headWordCount * 32 || offset % 32 !== 0) return null;
  if (base > bytes.length - offset - 32) return null;
  const start = base + offset;
  const length = abiInteger(bytes, 0, start);
  if (length === null || length > bytes.length - start - 32) return null;
  return new TextDecoder().decode(bytes.subarray(start + 32, start + 32 + length));
}

function abiWord(value: number): Uint8Array {
  const word = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 24 && remaining > 0; index -= 1) {
    word[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  return word;
}

// ── encoding and decoding ───────────────────────────────────────────────

/** ABI-encodes `getDocById(bytes)` for a current-state lookup. The DID is
 *  bounded before allocation because it came from the network. */
export function currentRecordCallData(did: string): string | null {
  const value = new TextEncoder().encode(did);
  if (value.length === 0 || value.length > 4_096) return null;
  const padding = new Uint8Array((32 - (value.length % 32)) % 32);
  const encoded = new Uint8Array(32 + 32 + value.length + padding.length);
  encoded.set(abiWord(32), 0);
  encoded.set(abiWord(value.length), 32);
  encoded.set(value, 64);
  return `0x${CURRENT_RECORD_SELECTOR}${hexFromBytes(encoded)}`;
}

/** Decodes the registration calldata: six head words, the first three offsets
 *  to strings and the next two the category values compared here. */
export function decodeRegistryInput(value: string): RegistryInput | null {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length < 8 || hex.slice(0, 8).toLowerCase() !== REGISTER_SELECTOR) return null;
  const bytes = bytesFromHex(hex.slice(8));
  if (!bytes || bytes.length < 192) return null;
  const did = abiString(bytes, 0);
  const signedDIDDocument = abiString(bytes, 1);
  const organisationJSON = abiString(bytes, 2);
  const orgType = abiInteger(bytes, 3);
  const orgGroup = abiInteger(bytes, 4);
  if (did === null || signedDIDDocument === null || organisationJSON === null
      || orgType === null || orgGroup === null) return null;
  return { did, signedDIDDocument, organisationJSON, orgType, orgGroup };
}

/** Decodes the contract's current record:
 *  `(signedDIDDocument, organisationJSON, orgType, orgGroup, revoked)`. */
export function decodeCurrentRecord(value: string): CurrentRegistryRecord | null {
  const bytes = bytesFromHex(value);
  if (!bytes || bytes.length < 32) return null;
  const base = abiInteger(bytes, 0);
  if (base === null || base < 32 || base > bytes.length - 160) return null;
  const signedDIDDocument = abiString(bytes, 0, base, 5);
  const organisationJSON = abiString(bytes, 1, base, 5);
  const orgType = abiInteger(bytes, 2, base);
  const orgGroup = abiInteger(bytes, 3, base);
  const revoked = abiInteger(bytes, 4, base);
  if (signedDIDDocument === null || organisationJSON === null || orgType === null
      || orgGroup === null || (revoked !== 0 && revoked !== 1)) return null;
  return { signedDIDDocument, organisationJSON, orgType, orgGroup, revoked: revoked === 1 };
}

/** Structural JSON equality: the organisation object is re-serialised by every
 *  hop, so comparing strings would report differences that are only key order. */
export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonEqual(item, right[index]));
  }
  if (typeof left !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && jsonEqual(a[key], b[key]));
}

function parseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export interface RegistrationCheck {
  did: string;
  verdict: ChainVerdict;
  reason?: string;
  blockNumber?: string;
  transactionHash?: string;
}

/** The comparison itself, pure so every branch is testable without a socket. */
export function checkRegistration(
  registration: Registration,
  record: OnChainRecord,
  transaction: Record<string, unknown> | undefined,
  receipt: Record<string, unknown> | undefined,
  current: CurrentRegistryRecord | null,
): RegistrationCheck {
  const fail = (reason: string): RegistrationCheck =>
    ({ did: registration.did, verdict: "mismatch", reason });

  if (record.net.toLowerCase() !== REGISTRY_NETWORK) return fail("鏈別不是 arbitrum");
  if (record.scAddress.toLowerCase() !== REGISTRY_CONTRACT) return fail("合約位址不符");
  if (record.status !== 1) return fail("API 標示這筆鏈上紀錄非啟用");
  if (!transaction || !receipt) return fail("交易或收據在鏈上找不到");
  if (String(transaction.hash ?? "").toLowerCase() !== record.txHash.toLowerCase()) return fail("交易雜湊不符");
  if (String(transaction.to ?? "").toLowerCase() !== REGISTRY_CONTRACT) return fail("交易對象不是登錄合約");
  if (receipt.status !== "0x1") return fail("交易收據顯示失敗");

  const decoded = typeof transaction.input === "string" ? decodeRegistryInput(transaction.input) : null;
  if (!decoded) return fail("交易 calldata 不是登錄方法");
  if (decoded.did !== registration.did) return fail("交易寫入的 DID 與這筆不同");
  if (decoded.signedDIDDocument !== registration.signedDIDDocument) return fail("鏈上 DID 文件與 API 不同");
  if (decoded.orgType !== registration.orgType) return fail("鏈上 orgType 與 API 不同");
  if (decoded.orgGroup !== registration.orgGroup) return fail("鏈上 orgGroup 與 API 不同");
  if (!jsonEqual(parseJSON(decoded.organisationJSON), registration.organisation)) {
    return fail("鏈上機構資料與 API 不同");
  }

  if (!current) return fail("合約查不到這個 DID 的現況紀錄");
  if (current.revoked) return fail("合約現況顯示此登錄已撤銷");
  if (current.signedDIDDocument !== registration.signedDIDDocument) return fail("現況 DID 文件與 API 不同");
  if (current.orgType !== registration.orgType) return fail("現況 orgType 與 API 不同");
  if (current.orgGroup !== registration.orgGroup) return fail("現況 orgGroup 與 API 不同");
  if (!jsonEqual(parseJSON(current.organisationJSON), registration.organisation)) {
    return fail("現況機構資料與 API 不同");
  }

  const blockNumber = typeof transaction.blockNumber === "string" ? transaction.blockNumber : undefined;
  if (!blockNumber) return fail("交易沒有區塊編號");
  return { did: registration.did, verdict: "verified", blockNumber, transactionHash: record.txHash };
}

/** A JSON-RPC error that means the chain could not be consulted, as opposed to
 *  the contract answering that no such record exists (a revert, which is a real
 *  mismatch rather than an outage). */
function isInfrastructureError(reply: Record<string, unknown> | undefined): boolean {
  const error = reply?.error as { message?: unknown } | undefined;
  if (!error) return false;
  return !String(error.message ?? "").toLowerCase().includes("execution reverted");
}

export interface ChainScan {
  /** Per DID, the worst finding across its registrations — a mismatch anywhere
   *  is the signal worth surfacing, so it outranks a sibling that verified. */
  byDid: Map<string, RegistrationCheck>;
  rpcOk: boolean;
  rpcLatencyMs: number;
  rpcError?: string;
  blockNumber?: string;
  /** Which provider actually answered, so a silent failover is visible. */
  rpcEndpoint?: string;
}

const RANK: Record<ChainVerdict, number> = { mismatch: 3, unavailable: 2, verified: 1, notAnchored: 0 };
/** DIDs per JSON-RPC batch. Each one costs three calls, and a public endpoint
 *  is happier with several modest batches than one enormous array. */
/** DIDs per JSON-RPC batch, each costing three calls.
 *
 *  The rate limiter counts requests, not calls, and the official endpoint
 *  answered a 129-call array without complaint (measured 2026-09-09), so the
 *  whole registry fits in one or two requests. Going the other way — many small
 *  batches — is what got this monitor rate-limited into a half-empty result on
 *  its first two production runs. Forty keeps a batch at 120 calls, comfortably
 *  inside what was measured, with room for the registry to grow. */
const DIDS_PER_BATCH = 40;
/** A pause between batches. This runs once a day, so spending a few seconds
 *  being a polite client costs nothing and avoids the rate limiter. */
const BATCH_PAUSE_MS = 1_500;
/** Waits before re-trying the same endpoint, in order. Generous because a daily
 *  job has all the time in the world and the alternative — falling back to a
 *  provider that cannot serve archive queries — is worse than waiting. */
const BACKOFF_MS = [0, 2_000, 8_000];

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** POSTs to the best endpoint that will answer.
 *
 *  Each endpoint gets its own backoff ladder before the next is tried, because
 *  the preferred endpoint being briefly rate-limited is a much better problem
 *  than the fallback being permanently unable to serve archive queries. */
async function callRPC(
  endpoints: string[],
  body: unknown,
  fetcher: typeof fetch,
  retryScale: number,
): Promise<{ json: unknown; endpoint: string }> {
  let lastError = "";
  for (const endpoint of endpoints) {
    for (const backoff of BACKOFF_MS) {
      if (backoff) await sleep(backoff * retryScale);
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = `RPC ${response.status}`;
          continue;
        }
        if (!response.ok) {
          lastError = `RPC ${response.status}`;
          break;
        }
        return { json: await response.json(), endpoint };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "RPC 失敗";
      }
    }
  }
  throw new Error(lastError || "RPC 無法連線");
}

export async function scanChain(
  registrations: Registration[],
  options: { rpcURLs?: string[]; fetcher?: typeof fetch; retryScale?: number } = {},
): Promise<ChainScan> {
  const endpoints = options.rpcURLs ?? ARBITRUM_RPCS;
  const fetcher = options.fetcher ?? fetch;
  const retryScale = options.retryScale ?? 1;
  const byDid = new Map<string, RegistrationCheck>();
  const record = (check: RegistrationCheck) => {
    const existing = byDid.get(check.did);
    if (!existing || RANK[check.verdict] > RANK[existing.verdict]) byDid.set(check.did, check);
  };

  const work: Array<{ registration: Registration; record: OnChainRecord; callData: string }> = [];
  for (const registration of registrations) {
    const anchor = registration.onChainRecords.at(-1);
    if (!anchor) {
      record({ did: registration.did, verdict: "notAnchored", reason: "API 未提供鏈上紀錄" });
      continue;
    }
    const callData = currentRecordCallData(registration.did);
    if (!callData) {
      record({ did: registration.did, verdict: "mismatch", reason: "DID 無法編碼為合約查詢" });
      continue;
    }
    work.push({ registration, record: anchor, callData });
  }

  const started = Date.now();
  let blockNumber: string | undefined;
  if (!work.length) {
    return { byDid, rpcOk: true, rpcLatencyMs: 0 };
  }

  let rpcEndpoint: string | undefined;
  try {
    // One block-number call proves the provider is live even when every
    // registration turns out to be unanchored.
    const head = await callRPC(
      endpoints, { jsonrpc: "2.0", id: 0, method: "eth_blockNumber", params: [] }, fetcher, retryScale,
    );
    rpcEndpoint = head.endpoint;
    const parsed = head.json as { result?: unknown };
    if (typeof parsed?.result === "string") blockNumber = parsed.result;

    for (let offset = 0; offset < work.length; offset += DIDS_PER_BATCH) {
      const batch = work.slice(offset, offset + DIDS_PER_BATCH);
      const calls = batch.flatMap((item, index) => [
        { jsonrpc: "2.0", id: index * 3, method: "eth_getTransactionByHash", params: [item.record.txHash] },
        { jsonrpc: "2.0", id: index * 3 + 1, method: "eth_getTransactionReceipt", params: [item.record.txHash] },
        { jsonrpc: "2.0", id: index * 3 + 2, method: "eth_call",
          params: [{ to: REGISTRY_CONTRACT, data: item.callData }, "latest"] },
      ]);
      if (offset > 0) await sleep(BATCH_PAUSE_MS);
      const answer = await callRPC(endpoints, calls, fetcher, retryScale);
      rpcEndpoint = answer.endpoint;
      const replies = answer.json as Array<Record<string, unknown>>;
      if (!Array.isArray(replies)) throw new Error("RPC 回應不是批次陣列");
      const byId = new Map<number, Record<string, unknown>>();
      for (const reply of replies) {
        if (typeof reply?.id === "number") byId.set(reply.id, reply);
      }
      batch.forEach((item, index) => {
        const trio = [byId.get(index * 3), byId.get(index * 3 + 1), byId.get(index * 3 + 2)];
        if (trio.some((reply) => !reply) || trio.some(isInfrastructureError)) {
          record({ did: item.registration.did, verdict: "unavailable", reason: "RPC 未能回答這筆查詢" });
          return;
        }
        const transaction = trio[0]?.result as Record<string, unknown> | undefined;
        const receipt = trio[1]?.result as Record<string, unknown> | undefined;
        const currentRaw = trio[2]?.result;
        const current = typeof currentRaw === "string" ? decodeCurrentRecord(currentRaw) : null;
        record(checkRegistration(item.registration, item.record, transaction, receipt, current));
      });
    }
  } catch (error) {
    for (const item of work) {
      record({ did: item.registration.did, verdict: "unavailable", reason: "無法連上 Arbitrum RPC" });
    }
    return {
      byDid,
      rpcOk: false,
      rpcLatencyMs: Date.now() - started,
      rpcError: error instanceof Error ? error.message : "RPC 失敗",
      blockNumber,
      rpcEndpoint,
    };
  }
  return { byDid, rpcOk: true, rpcLatencyMs: Date.now() - started, blockNumber, rpcEndpoint };
}
