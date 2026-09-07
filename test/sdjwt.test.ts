// The card this issuer mints, checked the way both consumers check it: the
// 請出示皮夾 verifier's `verifyIssuerCredential` (copied here unchanged), and
// the shape assertions the 有備而來 wallet's TWDIWCredentialReader makes —
// ES256, an accepted `typ`, a jwk_jcs-pub did:key `iss` that verifies the
// signature, `sub`, `cnf.jwk`, `vc.type[1]`, `_sd` inside
// `vc.credentialSubject`, and a trailing `~` with no key-binding JWT.

import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT, decodeJwt, decodeProtectedHeader, exportJWK, generateKeyPair, importJWK, jwtVerify, type JWK } from "jose";
import { jwkJcsPubDidKey, resolveDidKeyToJwk } from "../src/didkey";
import { CARD_TYPES, PERSONAS, claimsFor } from "../src/catalog";
import { issuerAudiences, verifyProofJwt } from "../src/proof";
import { b64url, disclosureFor, mintTwdiwSdJwt, sha256b64url, type Signer } from "../src/sdjwt";
import { STATUS_LIST_BITS, encodedList, statusListJwt } from "../src/statuslist";
import { verifyIssuerCredential } from "../src/verify";
import { verifyModaVpToken } from "../src/moda";

const ORIGIN = "https://issuer.test";
const STATUS_URL = `${ORIGIN}/status/1`;

async function testSigner(): Promise<{ signer: Signer; publicJwk: JWK }> {
  // Web Crypto directly: jose's generateKeyPair hands back a Node KeyObject,
  // which crypto.subtle.sign does not take.
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JWK;
  const didKey = jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: publicJwk.x!, y: publicJwk.y! });
  const signer: Signer = {
    didKey,
    async sign(signingInput) {
      const raw = new Uint8Array(await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(signingInput),
      ));
      return b64url(raw);
    },
  };
  return { signer, publicJwk };
}

async function holder() {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(pair.publicKey);
  const did = jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! });
  return { pair, jwk: { kty: "EC" as const, crv: "P-256" as const, x: jwk.x!, y: jwk.y! }, did };
}

afterEach(() => vi.restoreAllMocks());

describe("minting a TWDIW-dialect card", () => {
  it("produces what the wallet reader requires and what the verifier accepts", async () => {
    const { signer } = await testSigner();
    const wallet = await holder();
    const card = CARD_TYPES[0];
    const claims = claimsFor(card, PERSONAS[0], new Date("2026-09-08T00:00:00Z"));
    const minted = await mintTwdiwSdJwt({
      signer, holderJwk: wallet.jwk, holderDid: wallet.did, credentialType: card.id, claims,
      origin: ORIGIN, statusListUrl: STATUS_URL, statusIndex: 7, validitySeconds: 3600,
    });

    // Compact form: issuer JWT, one disclosure per claim, trailing ~, no KB-JWT.
    expect(minted.serialized.endsWith("~")).toBe(true);
    const parts = minted.serialized.split("~");
    expect(parts[0]).toBe(minted.jws);
    expect(parts.slice(1, -1)).toEqual(minted.disclosures);
    expect(parts.at(-1)).toBe("");
    expect(minted.disclosures.length).toBe(card.claims.length);

    // Header and payload shape the wallet's TWDIWCredentialReader checks.
    const header = decodeProtectedHeader(minted.jws) as { alg: string; typ: string; kid: string };
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("vc+sd-jwt");
    const payload = decodeJwt(minted.jws) as Record<string, any>;
    expect(payload.iss).toBe(signer.didKey);
    expect(payload.iss.startsWith("did:key:z2dmz")).toBe(true); // jwk_jcs-pub spelling
    expect(payload.sub).toBe(wallet.did);
    expect(payload.cnf.jwk).toEqual(wallet.jwk);
    expect(payload.vc.type).toEqual(["VerifiableCredential", card.id]);
    expect(payload.vc.credentialSubject._sd_alg).toBe("sha-256");
    expect(payload.vc.credentialSubject._sd.length).toBe(card.claims.length);
    expect(payload.vc.credentialStatus.statusListCredential).toBe(STATUS_URL);
    expect(payload.vc.credentialStatus.statusListIndex).toBe("7");
    expect(payload.jti.startsWith(`${ORIGIN}/vc/`)).toBe(true);
    expect(payload.exp - payload.iat).toBe(3600);

    // The signature verifies against the key inside `iss` — the wallet's rule.
    const issuerKey = await importJWK(resolveDidKeyToJwk(payload.iss)!, "ES256");
    await expect(jwtVerify(minted.jws, issuerKey)).resolves.toBeTruthy();

    // Every disclosure digest is committed in `_sd`.
    for (const disclosure of minted.disclosures) {
      expect(payload.vc.credentialSubject._sd).toContain(await sha256b64url(disclosure));
    }

    // The verifier reconstructs the claims from the disclosures (status list unreachable → unknown).
    globalThis.fetch = vi.fn(async () => new Response("no", { status: 599 })) as typeof fetch;
    const verified = await verifyIssuerCredential(minted.jws, minted.disclosures, [signer.didKey]);
    expect(verified.ok).toBe(true);
    expect(verified.issuer).toBe(signer.didKey);
    expect((verified.claims as any).vc.credentialSubject.name).toBe(PERSONAS[0].name);
    expect((verified.claims as any).vc.credentialSubject.license_type).toBe(PERSONAS[0].licenseType);
    expect(verified.status).toBe("unknown");
  });

  it("is rejected by the verifier when the issuer is not on its trust list", async () => {
    const { signer } = await testSigner();
    const wallet = await holder();
    const minted = await mintTwdiwSdJwt({
      signer, holderJwk: wallet.jwk, holderDid: wallet.did, credentialType: CARD_TYPES[1].id,
      claims: { name: "王小明" }, origin: ORIGIN, statusListUrl: STATUS_URL, statusIndex: 0, validitySeconds: 60,
    });
    const verified = await verifyIssuerCredential(minted.jws, minted.disclosures, ["did:key:zSomebodyElse"]);
    expect(verified.ok).toBe(false);
    expect(verified.reason).toMatch(/trust list/);
  });

  it("uses a fresh salt per disclosure so equal values never share a digest", async () => {
    const a = await disclosureFor("name", "王小明");
    const b = await disclosureFor("name", "王小明");
    expect(a.digest).not.toBe(b.digest);
    expect(JSON.parse(atob(a.disclosure.replace(/-/g, "+").replace(/_/g, "/")))[1]).toBe("name");
  });
});

describe("the status list the card points at", () => {
  it("is a StatusList2021 JWT the verifier reads as valid, and as revoked once a bit is set", async () => {
    const { signer } = await testSigner();
    const wallet = await holder();
    const index = 42;
    const minted = await mintTwdiwSdJwt({
      signer, holderJwk: wallet.jwk, holderDid: wallet.did, credentialType: CARD_TYPES[2].id,
      claims: { name: "陳美玲" }, origin: ORIGIN, statusListUrl: STATUS_URL, statusIndex: index, validitySeconds: 60,
    });
    const serveList = (revoked: number[]) => async () => {
      const token = await statusListJwt(signer, { listUrl: STATUS_URL, revoked });
      return new Response(token, { status: 200, headers: { "content-type": "application/jwt" } });
    };

    globalThis.fetch = vi.fn(serveList([])) as typeof fetch;
    const valid = await verifyIssuerCredential(minted.jws, minted.disclosures, [signer.didKey]);
    expect(valid.ok).toBe(true);
    expect(valid.status).toBe("valid");

    globalThis.fetch = vi.fn(serveList([index])) as typeof fetch;
    const revoked = await verifyIssuerCredential(minted.jws, minted.disclosures, [signer.didKey]);
    expect(revoked.ok).toBe(false);
    expect(revoked.status).toBe("revoked");
  });

  it("is 16 KiB of bits, MSB-first, gzip then base64", async () => {
    const encoded = await encodedList([0, 9]);
    const gz = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const bytes = new Uint8Array(await new Response(new Response(gz).body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    expect(bytes.length).toBe(STATUS_LIST_BITS / 8);
    expect(bytes[0]).toBe(0x80);
    expect(bytes[1]).toBe(0x40);
    expect(bytes.slice(2).every((byte) => byte === 0)).toBe(true);
  });
});

describe("the wallet's proof of possession", () => {
  async function proofFrom(wallet: Awaited<ReturnType<typeof holder>>, overrides: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
    return new SignJWT({ iss: "moda_dw", nonce: "nonce-1", ...overrides })
      .setProtectedHeader({ alg: "ES256", typ: "openid4vci-proof+jwt", kid: wallet.did, ...header })
      .setIssuedAt()
      .setAudience(typeof overrides.aud === "string" ? overrides.aud : `${ORIGIN}/`)
      .sign(wallet.pair.privateKey);
  }

  it("accepts the 有備而來 shape: kid is a jwk_jcs-pub did:key, aud has a trailing slash, iss is moda_dw", async () => {
    const wallet = await holder();
    const result = await verifyProofJwt(await proofFrom(wallet), { audiences: issuerAudiences(ORIGIN), nonce: "nonce-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.holderDid).toBe(wallet.did);
      expect(result.holderJwk).toEqual(wallet.jwk);
    }
  });

  it("accepts a key carried in the header jwk and derives the holder did from it", async () => {
    const wallet = await holder();
    const jwt = await new SignJWT({ nonce: "nonce-1" })
      .setProtectedHeader({ alg: "ES256", typ: "openid4vci-proof+jwt", jwk: wallet.jwk })
      .setIssuedAt().setAudience(ORIGIN).sign(wallet.pair.privateKey);
    const result = await verifyProofJwt(jwt, { audiences: issuerAudiences(ORIGIN), nonce: "nonce-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.holderDid).toBe(wallet.did);
  });

  it("rejects a wrong nonce, a wrong audience, a wrong typ and a foreign signature", async () => {
    const wallet = await holder();
    const audiences = issuerAudiences(ORIGIN);
    expect((await verifyProofJwt(await proofFrom(wallet), { audiences, nonce: "other" })).ok).toBe(false);
    expect((await verifyProofJwt(await proofFrom(wallet, { aud: "https://elsewhere.test/" }), { audiences, nonce: "nonce-1" })).ok).toBe(false);
    expect((await verifyProofJwt(await proofFrom(wallet, {}, { typ: "JWT" }), { audiences, nonce: "nonce-1" })).ok).toBe(false);
    const attacker = await holder();
    const forged = await new SignJWT({ nonce: "nonce-1" })
      .setProtectedHeader({ alg: "ES256", typ: "openid4vci-proof+jwt", kid: wallet.did })
      .setIssuedAt().setAudience(ORIGIN).sign(attacker.pair.privateKey);
    const result = await verifyProofJwt(forged, { audiences, nonce: "nonce-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/rejected/);
  });
});

describe("presenting the card back in the moda dialect", () => {
  it("verifies end to end against the issuer's own DID as the only trusted issuer", async () => {
    const { signer } = await testSigner();
    const wallet = await holder();
    const card = CARD_TYPES[1];
    const claims = claimsFor(card, PERSONAS[2]);
    const minted = await mintTwdiwSdJwt({
      signer, holderJwk: wallet.jwk, holderDid: wallet.did, credentialType: card.id, claims,
      origin: ORIGIN, statusListUrl: STATUS_URL, statusIndex: 3, validitySeconds: 3600,
    });
    // The wallet discloses only the requested claims: name and phonel5.
    const keep = new Set(["name", "phonel5"]);
    const shown = minted.disclosures.filter((d) => keep.has(JSON.parse(atob(d.replace(/-/g, "+").replace(/_/g, "/")))[1]));
    const presented = `${minted.jws}~${shown.map((d) => `${d}~`).join("")}`;
    const vpToken = await new SignJWT({
      iss: wallet.did, sub: wallet.did, nonce: "n0nce",
      vp: { context: ["https://www.w3.org/2018/credentials/v1"], type: ["VerifiablePresentation"], verifiableCredential: [presented] },
    }).setProtectedHeader({ alg: "ES256", typ: "JWT", jwk: wallet.jwk }).setAudience(signer.didKey).setIssuedAt().setExpirationTime("10m").sign(wallet.pair.privateKey);

    globalThis.fetch = vi.fn(async () => new Response("no", { status: 599 })) as typeof fetch;
    const result = await verifyModaVpToken(vpToken, { expectedNonce: "n0nce", expectedAudience: signer.didKey, trustedIssuers: [signer.didKey] });
    expect(result.ok).toBe(true);
    expect(result.holderBound).toBe(true);
    const subject = (result.claims as any).vc.credentialSubject;
    expect(subject.name).toBe(PERSONAS[2].name);
    expect(subject.phonel5).toBe(PERSONAS[2].phone.slice(-5));
    expect(subject.phone_number).toBeUndefined(); // withheld
  });
});
