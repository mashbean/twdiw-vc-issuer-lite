// The wallet's proof of possession at the credential endpoint.
//
// OID4VCI asks the wallet to sign a short JWT with the key the credential
// should be bound to. The 有備而來 wallet (matching the official moda app) sends:
//
//   header:  { typ:"openid4vci-proof+jwt", alg:"ES256", kid:<holder did:key> }
//   payload: { iss:"moda_dw", aud:<issuer identifier + "/">, iat, nonce:<c_nonce> }
//
// The `kid` is a `did:key` in the `jwk_jcs-pub` spelling, so the key comes out
// of the identifier itself; a wallet that puts the key in a header `jwk` is
// accepted too. `iss` is the wallet's echo of `client_id` and is not checked —
// it has no authentication value (see the token endpoint).

import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { jwkJcsPubDidKey, resolveDidKeyToJwk } from "./didkey";
import type { HolderKey } from "./sdjwt";

export type ProofResult =
  | { ok: true; holderJwk: HolderKey; holderDid: string }
  | { ok: false; reason: string };

/** The audiences a wallet may name: the issuer identifier with and without a trailing slash. */
export function issuerAudiences(origin: string): string[] {
  const bare = origin.replace(/\/$/, "");
  return [bare, `${bare}/`];
}

function isP256Jwk(value: unknown): value is JWK & HolderKey {
  const jwk = value as Partial<HolderKey> | undefined;
  return !!jwk && jwk.kty === "EC" && jwk.crv === "P-256"
    && typeof jwk.x === "string" && typeof jwk.y === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(jwk.x) && /^[A-Za-z0-9_-]{43}$/.test(jwk.y);
}

export async function verifyProofJwt(
  jwt: string,
  opts: { audiences: string[]; nonce: string; nowMs?: number },
): Promise<ProofResult> {
  if (typeof jwt !== "string" || jwt.length > 8_192) return { ok: false, reason: "proof JWT is missing or too large" };
  let header: { alg?: string; typ?: string; kid?: string; jwk?: unknown };
  try {
    header = decodeProtectedHeader(jwt) as typeof header;
  } catch {
    return { ok: false, reason: "proof JWT header is not readable" };
  }
  if (header.alg !== "ES256") return { ok: false, reason: "proof JWT must use ES256" };
  if (header.typ !== "openid4vci-proof+jwt") return { ok: false, reason: "proof JWT typ must be openid4vci-proof+jwt" };

  let jwk: unknown;
  let holderDid: string | undefined;
  if (header.jwk !== undefined) {
    jwk = header.jwk;
  } else if (typeof header.kid === "string") {
    const did = header.kid.split("#", 1)[0];
    if (!did.startsWith("did:key:")) return { ok: false, reason: "proof JWT kid is not a did:key" };
    if (did.length > 1_024) return { ok: false, reason: "proof JWT kid is too long" };
    jwk = resolveDidKeyToJwk(did);
    if (!jwk) return { ok: false, reason: "proof JWT kid is not a resolvable did:key" };
    holderDid = did;
  } else {
    return { ok: false, reason: "proof JWT names no key (neither jwk nor kid)" };
  }
  if (!isP256Jwk(jwk)) return { ok: false, reason: "proof key must be a P-256 EC JWK" };
  const holderJwk: HolderKey = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };

  try {
    const key = await importJWK(holderJwk as JWK, "ES256");
    const { payload } = await jwtVerify(jwt, key, {
      algorithms: ["ES256"],
      audience: opts.audiences,
      typ: "openid4vci-proof+jwt",
      clockTolerance: 300,
      maxTokenAge: "10 minutes",
      currentDate: opts.nowMs ? new Date(opts.nowMs) : undefined,
    });
    if (typeof payload.nonce !== "string" || payload.nonce !== opts.nonce) {
      return { ok: false, reason: "proof JWT nonce does not match c_nonce" };
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `proof JWT rejected: ${error.message}` : "proof JWT rejected" };
  }
  return { ok: true, holderJwk, holderDid: holderDid ?? jwkJcsPubDidKey(holderJwk) };
}
