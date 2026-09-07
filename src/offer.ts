// The OID4VCI pre-authorised code flow, as pure functions.
//
// The wallet's side of this flow (measured from the 有備而來 wallet, which
// matches the official moda app) is narrow:
//
//   1. GET  <credential_offer_uri>                     → the offer object
//   2. GET  <credential_issuer>/.well-known/openid-credential-issuer
//                                                       → reads `credential_endpoint` only
//   3. POST <credential_issuer>/token   (form-encoded)   grant_type, pre-authorized_code,
//                                                       client_id=moda_dw, authorization_details
//                                                       → needs `access_token` and `c_nonce`
//   4. POST <credential_endpoint>       (JSON, Bearer)   { credential_identifier, proofs:{jwt:[…]} }
//                                                       → `credential` or `credentials[0].credential`
//
// Steps 3 and 4 arrive without the session id in the URL, so both the code and
// the access token are compound: `<session id>.<secret>`. The Worker routes on
// the id and the Durable Object compares the secret in constant time.

import type { CardType } from "./catalog";

export const OFFER_TTL_MS = 10 * 60 * 1000;
export const PRE_AUTHORIZED_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code";
export const ACCESS_TOKEN_LIFETIME_S = 600;
export const C_NONCE_LIFETIME_S = 600;

export type WalletFamily = "bonds" | "twdiw";

export function isWalletFamily(value: unknown): value is WalletFamily {
  return value === "bonds" || value === "twdiw";
}

/** The issuer identifier: the public origin, no trailing slash. */
export function issuerIdentifier(origin: string): string {
  return origin.replace(/\/$/, "");
}

/** The offer object the wallet fetches. No `tx_code`: the wallet never sends one. */
export function credentialOfferObject(origin: string, cardId: string, code: string) {
  return {
    credential_issuer: issuerIdentifier(origin),
    credential_configuration_ids: [cardId],
    grants: {
      [PRE_AUTHORIZED_GRANT]: { "pre-authorized_code": code },
    },
  };
}

/** The deep link a wallet opens. 有備而來 registers the standard scheme; the
 *  official 數位憑證皮夾 only its own. */
export function offerDeepLink(wallet: WalletFamily, offerUri: string): string {
  const query = `credential_offer_uri=${encodeURIComponent(offerUri)}`;
  return wallet === "twdiw"
    ? `modadigitalwallet://credential_offer?${query}`
    : `openid-credential-offer://?${query}`;
}

export function issuerMetadata(origin: string, cards: CardType[]) {
  const issuer = issuerIdentifier(origin);
  return {
    credential_issuer: issuer,
    authorization_servers: [issuer],
    credential_endpoint: `${issuer}/credential`,
    token_endpoint: `${issuer}/token`,
    display: [
      { name: "請收下卡片｜測試發卡站", locale: "zh-Hant" },
      { name: "Please Take This Card — test issuer", locale: "en" },
    ],
    credential_configurations_supported: Object.fromEntries(cards.map((card) => [card.id, {
      format: "vc+sd-jwt",
      scope: card.id,
      cryptographic_binding_methods_supported: ["did:key"],
      credential_signing_alg_values_supported: ["ES256"],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ["ES256"] } },
      credential_definition: {
        type: ["VerifiableCredential", card.id],
      },
      display: [
        { name: card.name, locale: "zh-Hant", description: card.description },
        { name: card.nameEnglish, locale: "en" },
      ],
      claims: card.claims.map((claim) => ({ path: ["vc", "credentialSubject", claim.key], display: [{ name: claim.label, locale: "zh-Hant" }] })),
    }])),
  };
}

export function authorizationServerMetadata(origin: string) {
  const issuer = issuerIdentifier(origin);
  return {
    issuer,
    token_endpoint: `${issuer}/token`,
    grant_types_supported: [PRE_AUTHORIZED_GRANT],
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: [],
    "pre-authorized_grant_anonymous_access_supported": true,
  };
}

export function randomSecret(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function compoundToken(id: string, secret: string): string {
  return `${id}.${secret}`;
}

export function splitCompoundToken(value: unknown): { id: string; secret: string } | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const match = value.match(/^([0-9a-f-]{36})\.([0-9a-f]{64})$/);
  return match ? { id: match[1], secret: match[2] } : null;
}

const enc = new TextEncoder();

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const a = enc.encode(left);
  const b = enc.encode(right);
  let different = 0;
  for (let index = 0; index < a.length; index += 1) different |= a[index]! ^ b[index]!;
  return different === 0;
}

export type TokenRequest =
  | { ok: true; code: string; clientId: string; configurationId?: string }
  | { ok: false; error: string; description: string };

/** Reads the token request. `client_id` is recorded, never authenticated: the
 *  production TWDIW token endpoint pairs it with the code, but the value the
 *  wallets send is `moda_dw`, a constant, so it identifies nothing. */
export function parseTokenRequest(form: URLSearchParams): TokenRequest {
  if (form.get("grant_type") !== PRE_AUTHORIZED_GRANT) {
    return { ok: false, error: "unsupported_grant_type", description: "only the pre-authorized_code grant is supported" };
  }
  const code = form.get("pre-authorized_code") ?? "";
  if (!code) return { ok: false, error: "invalid_request", description: "pre-authorized_code is missing" };
  if (form.get("tx_code")) return { ok: false, error: "invalid_request", description: "this issuer never asks for a tx_code" };
  let configurationId: string | undefined;
  const details = form.get("authorization_details");
  if (details) {
    try {
      const parsed = JSON.parse(details) as Array<{ credential_configuration_id?: unknown }>;
      const first = Array.isArray(parsed) ? parsed[0] : undefined;
      if (typeof first?.credential_configuration_id === "string") configurationId = first.credential_configuration_id;
    } catch {
      return { ok: false, error: "invalid_request", description: "authorization_details is not JSON" };
    }
  }
  return { ok: true, code, clientId: form.get("client_id") ?? "", configurationId };
}

export type CredentialRequest =
  | { ok: true; proofJwt: string; credentialIdentifier?: string }
  | { ok: false; error: string; description: string };

/** Reads the credential request: draft-15 `proofs.jwt[0]` (what the wallets
 *  send) or the older single `proof.jwt`. */
export function parseCredentialRequest(body: unknown): CredentialRequest {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_credential_request", description: "body must be a JSON object" };
  const object = body as Record<string, unknown>;
  const proofs = object.proofs as { jwt?: unknown } | undefined;
  const proof = object.proof as { proof_type?: unknown; jwt?: unknown } | undefined;
  let proofJwt: unknown;
  if (Array.isArray(proofs?.jwt)) {
    if (proofs!.jwt.length !== 1) return { ok: false, error: "invalid_proof", description: "exactly one proof is expected" };
    proofJwt = proofs!.jwt[0];
  } else if (typeof proof?.jwt === "string") {
    proofJwt = proof.jwt;
  }
  if (typeof proofJwt !== "string" || !proofJwt) return { ok: false, error: "invalid_proof", description: "proofs.jwt[0] is missing" };
  const identifier = object.credential_identifier ?? object.credential_configuration_id;
  return { ok: true, proofJwt, credentialIdentifier: typeof identifier === "string" ? identifier : undefined };
}

export function tokenResponse(accessToken: string, cNonce: string, cardId: string) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_LIFETIME_S,
    c_nonce: cNonce,
    c_nonce_expires_in: C_NONCE_LIFETIME_S,
    authorization_details: [{
      type: "openid_credential",
      credential_configuration_id: cardId,
      credential_identifiers: [cardId],
    }],
  };
}
