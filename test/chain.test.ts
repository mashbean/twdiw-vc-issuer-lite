// The chain comparison, exercised without a socket.
//
// The interesting cases are all the ways an API claim can fail to match what
// Arbitrum actually holds, so each rejection branch gets its own assertion —
// a registry that says "anchored" while the transaction wrote a different DID
// is exactly the finding this dashboard exists to surface.

import { describe, expect, it, vi } from "vitest";
import {
  REGISTRY_CONTRACT,
  checkRegistration,
  currentRecordCallData,
  decodeCurrentRecord,
  decodeRegistryInput,
  jsonEqual,
  scanChain,
  type OnChainRecord,
  type Registration,
} from "../src/chain";

const REGISTER_SELECTOR = "f6e0d282";

// ── minimal ABI encoders, so the fixtures are real encodings ─────────────

function word(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function encodeString(value: string): { head: null; body: string; length: number } {
  const bytes = new TextEncoder().encode(value);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return { head: null, body: word(bytes.length) + padded, length: 32 + padded.length / 2 };
}

/** `register(did, signedDoc, orgJSON, orgType, orgGroup, unused)` calldata. */
function encodeRegistryInput(input: {
  did: string; signedDIDDocument: string; organisationJSON: string; orgType: number; orgGroup: number;
}): string {
  const strings = [input.did, input.signedDIDDocument, input.organisationJSON].map(encodeString);
  const headWords = 6;
  let offset = headWords * 32;
  const heads: string[] = [];
  for (const encoded of strings) {
    heads.push(word(offset));
    offset += encoded.length;
  }
  const head = heads.join("") + word(input.orgType) + word(input.orgGroup) + word(0);
  return `0x${REGISTER_SELECTOR}${head}${strings.map((s) => s.body).join("")}`;
}

/** The contract's `(string,string,uint,uint,bool)` return, behind one offset. */
function encodeCurrentRecord(record: {
  signedDIDDocument: string; organisationJSON: string; orgType: number; orgGroup: number; revoked: boolean;
}): string {
  const strings = [record.signedDIDDocument, record.organisationJSON].map(encodeString);
  const headWords = 5;
  let offset = headWords * 32;
  const heads: string[] = [];
  for (const encoded of strings) {
    heads.push(word(offset));
    offset += encoded.length;
  }
  const tuple = heads.join("") + word(record.orgType) + word(record.orgGroup)
    + word(record.revoked ? 1 : 0) + strings.map((s) => s.body).join("");
  return `0x${word(32)}${tuple}`;
}

const ORG = { name: "測試機關", taxId: "12345678" };
const REGISTRATION: Registration = {
  did: "did:key:zTestIssuer",
  orgType: 1,
  orgGroup: 2,
  signedDIDDocument: "eyJhbGciOiJFUzI1NiJ9.signed-did-document",
  organisation: ORG,
  onChainRecords: [{ net: "arbitrum", scAddress: REGISTRY_CONTRACT, txHash: "0xabc123", status: 1 }],
};
const ANCHOR: OnChainRecord = REGISTRATION.onChainRecords[0]!;

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    hash: ANCHOR.txHash,
    to: REGISTRY_CONTRACT,
    blockNumber: "0x1234",
    input: encodeRegistryInput({
      did: REGISTRATION.did,
      signedDIDDocument: REGISTRATION.signedDIDDocument,
      organisationJSON: JSON.stringify(ORG),
      orgType: REGISTRATION.orgType,
      orgGroup: REGISTRATION.orgGroup,
    }),
    ...overrides,
  };
}
const RECEIPT = { status: "0x1" };
const CURRENT = decodeCurrentRecord(encodeCurrentRecord({
  signedDIDDocument: REGISTRATION.signedDIDDocument,
  organisationJSON: JSON.stringify(ORG),
  orgType: REGISTRATION.orgType,
  orgGroup: REGISTRATION.orgGroup,
  revoked: false,
}));

describe("ABI encoding and decoding", () => {
  it("encodes a getDocById call with the measured selector and a padded DID", () => {
    const data = currentRecordCallData("did:key:zAbc");
    expect(data?.startsWith("0xfba6fe49")).toBe(true);
    // offset word, length word, then the DID padded to a 32-byte boundary.
    expect(((data!.length - 10) / 2) % 32).toBe(0);
    expect(currentRecordCallData("")).toBeNull();
    expect(currentRecordCallData("x".repeat(5000))).toBeNull();
  });

  it("round-trips a registration calldata", () => {
    const decoded = decodeRegistryInput(transaction().input);
    expect(decoded).toEqual({
      did: REGISTRATION.did,
      signedDIDDocument: REGISTRATION.signedDIDDocument,
      organisationJSON: JSON.stringify(ORG),
      orgType: 1,
      orgGroup: 2,
    });
  });

  it("refuses calldata that is not the registration method or is truncated", () => {
    expect(decodeRegistryInput("0xdeadbeef" + "00".repeat(192))).toBeNull();
    expect(decodeRegistryInput(`0x${REGISTER_SELECTOR}00`)).toBeNull();
    expect(decodeRegistryInput("not hex")).toBeNull();
  });

  it("round-trips the contract's current record, revoked flag included", () => {
    expect(CURRENT).toEqual({
      signedDIDDocument: REGISTRATION.signedDIDDocument,
      organisationJSON: JSON.stringify(ORG),
      orgType: 1,
      orgGroup: 2,
      revoked: false,
    });
    const revoked = decodeCurrentRecord(encodeCurrentRecord({
      signedDIDDocument: "d", organisationJSON: "{}", orgType: 1, orgGroup: 0, revoked: true,
    }));
    expect(revoked?.revoked).toBe(true);
    expect(decodeCurrentRecord("0x")).toBeNull();
  });
});

describe("comparing an API claim with the chain", () => {
  it("accepts a registration the transaction and the current record both match", () => {
    const result = checkRegistration(REGISTRATION, ANCHOR, transaction(), RECEIPT, CURRENT);
    expect(result.verdict).toBe("verified");
    expect(result.blockNumber).toBe("0x1234");
    expect(result.transactionHash).toBe(ANCHOR.txHash);
  });

  it("rejects a transaction that wrote a different DID", () => {
    const other = transaction({
      input: encodeRegistryInput({
        did: "did:key:zSomebodyElse",
        signedDIDDocument: REGISTRATION.signedDIDDocument,
        organisationJSON: JSON.stringify(ORG),
        orgType: 1, orgGroup: 2,
      }),
    });
    const result = checkRegistration(REGISTRATION, ANCHOR, other, RECEIPT, CURRENT);
    expect(result.verdict).toBe("mismatch");
    expect(result.reason).toMatch(/DID/);
  });

  it("rejects a current record the contract reports as revoked", () => {
    const revoked = decodeCurrentRecord(encodeCurrentRecord({
      signedDIDDocument: REGISTRATION.signedDIDDocument,
      organisationJSON: JSON.stringify(ORG),
      orgType: 1, orgGroup: 2, revoked: true,
    }));
    const result = checkRegistration(REGISTRATION, ANCHOR, transaction(), RECEIPT, revoked);
    expect(result.verdict).toBe("mismatch");
    expect(result.reason).toMatch(/撤銷/);
  });

  it.each([
    ["wrong network", { ...ANCHOR, net: "ethereum" }, /鏈別/],
    ["wrong contract", { ...ANCHOR, scAddress: "0xdead" }, /合約位址/],
    ["inactive record", { ...ANCHOR, status: 0 }, /非啟用/],
  ])("rejects an anchor with the %s", (_name, anchor, pattern) => {
    const result = checkRegistration(REGISTRATION, anchor as OnChainRecord, transaction(), RECEIPT, CURRENT);
    expect(result.verdict).toBe("mismatch");
    expect(result.reason).toMatch(pattern);
  });

  it("rejects a failed receipt and a missing transaction", () => {
    expect(checkRegistration(REGISTRATION, ANCHOR, transaction(), { status: "0x0" }, CURRENT).verdict).toBe("mismatch");
    expect(checkRegistration(REGISTRATION, ANCHOR, undefined, RECEIPT, CURRENT).verdict).toBe("mismatch");
  });

  it("compares organisation JSON structurally, not by byte order", () => {
    expect(jsonEqual({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    const reordered = transaction({
      input: encodeRegistryInput({
        did: REGISTRATION.did,
        signedDIDDocument: REGISTRATION.signedDIDDocument,
        organisationJSON: JSON.stringify({ taxId: "12345678", name: "測試機關" }),
        orgType: 1, orgGroup: 2,
      }),
    });
    expect(checkRegistration(REGISTRATION, ANCHOR, reordered, RECEIPT, CURRENT).verdict).toBe("verified");
  });
});

describe("scanning the whole registry", () => {
  function rpc(handler: (calls: unknown) => unknown) {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(handler(body)), { status: 200 });
    }) as unknown as typeof fetch;
  }

  it("verifies an anchored registration and reports the head block", async () => {
    const fetcher = rpc((calls) => {
      if (!Array.isArray(calls)) return { jsonrpc: "2.0", id: 0, result: "0x99" };
      return calls.map((call: { id: number; method: string }) => {
        if (call.method === "eth_getTransactionByHash") return { id: call.id, result: transaction() };
        if (call.method === "eth_getTransactionReceipt") return { id: call.id, result: RECEIPT };
        return {
          id: call.id,
          result: encodeCurrentRecord({
            signedDIDDocument: REGISTRATION.signedDIDDocument,
            organisationJSON: JSON.stringify(ORG),
            orgType: 1, orgGroup: 2, revoked: false,
          }),
        };
      });
    });
    const scan = await scanChain([REGISTRATION], { fetcher, retryScale: 0 });
    expect(scan.rpcOk).toBe(true);
    expect(scan.blockNumber).toBe("0x99");
    expect(scan.byDid.get(REGISTRATION.did)?.verdict).toBe("verified");
  });

  it("marks a registration with no anchor as notAnchored without calling the chain", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const scan = await scanChain([{ ...REGISTRATION, onChainRecords: [] }], { fetcher, retryScale: 0 });
    expect(scan.byDid.get(REGISTRATION.did)?.verdict).toBe("notAnchored");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never echoes a configured endpoint, which may carry an API key", async () => {
    const secret = "https://arbitrum-mainnet.infura.io/v3/SUPERSECRETKEY";
    const fetcher = vi.fn(async () => { throw new Error(`request to ${secret} failed`); }) as unknown as typeof fetch;
    const scan = await scanChain([REGISTRATION], { fetcher, retryScale: 0, rpcURLs: [secret] });
    const printed = JSON.stringify(scan.rpcTrail) + (scan.rpcError ?? "");
    expect(printed).not.toContain("SUPERSECRETKEY");
    expect(printed).toContain("arbitrum-mainnet.infura.io");
  });

  it("says so plainly when the configured endpoint is not a URL at all", async () => {
    const fetcher = vi.fn(async () => { throw new Error("Invalid URL: 211f74d324f94296bec2c45cacea6ff2"); }) as unknown as typeof fetch;
    const scan = await scanChain([REGISTRATION], { fetcher, retryScale: 0, rpcURLs: ["211f74d324f94296bec2c45cacea6ff2"] });
    const printed = JSON.stringify(scan.rpcTrail) + (scan.rpcError ?? "");
    expect(printed).not.toContain("211f74d324f94296bec2c45cacea6ff2");
    expect(printed).toContain("不是合法網址");
  });

  it("reports unavailable, never verified, when the RPC cannot be reached", async () => {
    const fetcher = vi.fn(async () => { throw new Error("boom"); }) as unknown as typeof fetch;
    const scan = await scanChain([REGISTRATION], { fetcher, retryScale: 0 });
    expect(scan.rpcOk).toBe(false);
    expect(scan.byDid.get(REGISTRATION.did)?.verdict).toBe("unavailable");
  });

  it("treats a contract revert as a real answer, not an outage", async () => {
    const fetcher = rpc((calls) => {
      if (!Array.isArray(calls)) return { jsonrpc: "2.0", id: 0, result: "0x1" };
      return calls.map((call: { id: number; method: string }) => {
        if (call.method === "eth_call") return { id: call.id, error: { message: "execution reverted" } };
        if (call.method === "eth_getTransactionByHash") return { id: call.id, result: transaction() };
        return { id: call.id, result: RECEIPT };
      });
    });
    const scan = await scanChain([REGISTRATION], { fetcher, retryScale: 0 });
    const check = scan.byDid.get(REGISTRATION.did);
    expect(check?.verdict).toBe("mismatch");
    expect(check?.reason).toMatch(/現況/);
  });

  it("keeps the worst verdict when one DID is registered twice", async () => {
    const second: Registration = { ...REGISTRATION, orgType: 2 };
    const fetcher = rpc((calls) => {
      if (!Array.isArray(calls)) return { jsonrpc: "2.0", id: 0, result: "0x1" };
      return calls.map((call: { id: number; method: string }) => {
        if (call.method === "eth_getTransactionByHash") return { id: call.id, result: transaction() };
        if (call.method === "eth_getTransactionReceipt") return { id: call.id, result: RECEIPT };
        return {
          id: call.id,
          result: encodeCurrentRecord({
            signedDIDDocument: REGISTRATION.signedDIDDocument,
            organisationJSON: JSON.stringify(ORG),
            orgType: 1, orgGroup: 2, revoked: false,
          }),
        };
      });
    });
    // The second registration claims orgType 2 while the chain says 1, so the
    // DID must surface as a mismatch even though its sibling verified.
    const scan = await scanChain([REGISTRATION, second], { fetcher, retryScale: 0 });
    expect(scan.byDid.get(REGISTRATION.did)?.verdict).toBe("mismatch");
  });
});
