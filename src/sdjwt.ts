// Minting a credential in the TWDIW dialect.
//
// TWDIW cards are SD-JWTs with a W3C `vc` wrapper rather than IETF SD-JWT VCs:
// the selectively disclosable digests live in `vc.credentialSubject._sd`, the
// type is `vc.type[1]`, the issuer is a `did:key` in the `jwk_jcs-pub` spelling
// whose payload *is* the issuer's public JWK, and the holder binding is
// `cnf.jwk`. The 有備而來 wallet's `TWDIWCredentialReader` refuses anything
// else, and the 請出示皮夾 verifier's `verifyIssuerCredential` accepts exactly
// this, so this is the one shape both sides already speak.
//
// Compact form:  <issuer-signed JWT>~<disclosure>~…~<disclosure>~
// with a trailing `~` and no key-binding JWT — possession is proved by the
// outer VP JWT at presentation time, not here.
//
// The private key never reaches this module. A `Signer` provides the DID and a
// signing oracle (the IssuerIdentity Durable Object in production, a jose key
// in tests).

export interface Signer {
  didKey: string;
  /** ES256 over `signingInput`, returned as base64url raw `r‖s`. */
  sign(signingInput: string): Promise<string>;
}

export interface HolderKey {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlText(text: string): string {
  return b64url(enc.encode(text));
}

export function b64urlJSON(value: unknown): string {
  return b64urlText(JSON.stringify(value));
}

export async function sha256b64url(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))));
}

/** 128 bits of salt, as the SD-JWT spec recommends. */
export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

/** One disclosure — `base64url(JSON([salt, name, value]))` — and its digest. */
export async function disclosureFor(
  name: string,
  value: unknown,
  salt = randomSalt(),
): Promise<{ disclosure: string; digest: string }> {
  const disclosure = b64urlJSON([salt, name, value]);
  return { disclosure, digest: await sha256b64url(disclosure) };
}

export interface MintInput {
  signer: Signer;
  holderJwk: HolderKey;
  /** The holder's own identifier, written to `sub`. */
  holderDid: string;
  /** `vc.type[1]` — the card type id. */
  credentialType: string;
  claims: Record<string, string>;
  /** The public origin, used for `jti`. */
  origin: string;
  statusListUrl: string;
  statusIndex: number;
  validitySeconds: number;
  now?: Date;
  jti?: string;
}

export interface Minted {
  serialized: string;
  jws: string;
  disclosures: string[];
  jti: string;
  issuedAt: number;
  expiresAt: number;
}

function isoSeconds(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function mintTwdiwSdJwt(input: MintInput): Promise<Minted> {
  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + input.validitySeconds;
  const jti = input.jti ?? `${input.origin.replace(/\/$/, "")}/vc/${crypto.randomUUID()}`;

  const disclosures: string[] = [];
  const digests: string[] = [];
  for (const [name, value] of Object.entries(input.claims)) {
    const { disclosure, digest } = await disclosureFor(name, value);
    disclosures.push(disclosure);
    digests.push(digest);
  }
  // Sorted so the digest order says nothing about the claim order.
  digests.sort();

  const holderJwk: HolderKey = { kty: "EC", crv: "P-256", x: input.holderJwk.x, y: input.holderJwk.y };
  const header = {
    alg: "ES256",
    typ: "vc+sd-jwt",
    kid: `${input.signer.didKey}#0`,
  };
  const payload = {
    iss: input.signer.didKey,
    sub: input.holderDid,
    jti,
    iat,
    nbf: iat,
    exp,
    cnf: { jwk: holderJwk },
    vc: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", input.credentialType],
      issuer: input.signer.didKey,
      issuanceDate: isoSeconds(iat),
      expirationDate: isoSeconds(exp),
      credentialSubject: {
        _sd: digests,
        _sd_alg: "sha-256",
      },
      credentialStatus: {
        id: `${input.statusListUrl}#${input.statusIndex}`,
        type: "StatusList2021Entry",
        statusPurpose: "revocation",
        statusListIndex: String(input.statusIndex),
        statusListCredential: input.statusListUrl,
      },
    },
  };
  const signingInput = `${b64urlJSON(header)}.${b64urlJSON(payload)}`;
  const jws = `${signingInput}.${await input.signer.sign(signingInput)}`;
  const serialized = `${jws}~${disclosures.map((disclosure) => `${disclosure}~`).join("")}`;
  return { serialized, jws, disclosures, jti, issuedAt: iat, expiresAt: exp };
}
