// The monitor's own end-to-end check: once a day the Worker plays the wallet
// against its own public origin and collects a real card.
//
// This is the difference between "the endpoints answered" and "issuance still
// works". A metadata document can be served perfectly while the token endpoint
// rejects every code, the proof rules drift, or a signing key is lost — none of
// which a ping notices. So this walks the exact sequence the 有備而來 wallet
// walks (offer by reference, `client_id=moda_dw`, an `openid4vci-proof+jwt`
// whose `kid` is a jwk_jcs-pub did:key), then verifies the returned credential
// the way the verifier would.
//
// It is the same script as `scripts/smoke.mjs`, moved inside the Worker so it
// runs unattended. The keypair it invents is discarded when the run ends, and
// the card it collects is never stored.

import { jwkJcsPubDidKey } from "./didkey";
import type { CheckResult } from "./probes";
import { b64url, b64urlJSON } from "./sdjwt";
import { verifyIssuerCredential } from "./verify";

const PRE_AUTHORIZED_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

// A type alias, not an interface: only aliases carry the implicit index
// signature that lets them satisfy the JSON payload type.
type Step = { name: string; ms: number };

async function signES256(privateKey: CryptoKey, signingInput: string): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  ));
  return b64url(raw);
}

export async function runIssuanceSelfTest(
  origin: string,
  options: { cardId?: string; personaId?: string; fetcher?: typeof fetch } = {},
): Promise<CheckResult> {
  const fetcher = options.fetcher ?? fetch;
  const cardId = options.cardId ?? "sandbox_driverlicense_car_v1";
  const personaId = options.personaId ?? "wang-xiaoming";
  const base = { target: "issuance-e2e", category: "e2e" as const, label: "發卡端到端自檢" };
  const steps: Step[] = [];
  const startedAll = Date.now();
  let mark = Date.now();
  const step = (name: string) => {
    steps.push({ name, ms: Date.now() - mark });
    mark = Date.now();
  };
  const fail = (detail: string): CheckResult => ({
    ...base, ok: false, latencyMs: Date.now() - startedAll, detail,
    data: { steps, cardId, personaId },
  });

  try {
    // 1. The page's own call: create an offer.
    const offerResponse = await fetcher(`${origin}/api/offers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, personaId, wallet: "bonds" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!offerResponse.ok) return fail(`建立 offer 失敗：HTTP ${offerResponse.status}`);
    const offer = await offerResponse.json() as { qr?: string; offerUri?: string };
    if (!offer.offerUri) return fail("建立 offer 的回應沒有 offerUri");
    step("offer");

    // 2. The wallet dereferences the offer.
    const objectResponse = await fetcher(offer.offerUri, { signal: AbortSignal.timeout(15_000) });
    if (!objectResponse.ok) return fail(`取得 offer 物件失敗：HTTP ${objectResponse.status}`);
    const offerObject = await objectResponse.json() as {
      credential_issuer?: string;
      credential_configuration_ids?: string[];
      grants?: Record<string, { "pre-authorized_code"?: string }>;
    };
    const code = offerObject.grants?.[PRE_AUTHORIZED_GRANT]?.["pre-authorized_code"];
    const issuerIdentifier = offerObject.credential_issuer?.replace(/\/$/, "");
    if (!code || !issuerIdentifier) return fail("offer 物件缺少預授權碼或 credential_issuer");
    step("offer-object");

    // 3. Issuer metadata: only `credential_endpoint` is read, as the wallet does.
    const metadataResponse = await fetcher(`${issuerIdentifier}/.well-known/openid-credential-issuer`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!metadataResponse.ok) return fail(`取得 metadata 失敗：HTTP ${metadataResponse.status}`);
    const metadata = await metadataResponse.json() as { credential_endpoint?: string };
    if (!metadata.credential_endpoint) return fail("metadata 沒有 credential_endpoint");
    if (new URL(metadata.credential_endpoint).host !== new URL(issuerIdentifier).host) {
      return fail("credential_endpoint 與 credential_issuer 不同主機");
    }
    step("metadata");

    // 4. Token, with the constant `client_id` the ecosystem sends.
    const form = new URLSearchParams({
      grant_type: PRE_AUTHORIZED_GRANT,
      "pre-authorized_code": code,
      client_id: "moda_dw",
      authorization_details: JSON.stringify([
        { type: "openid_credential", credential_configuration_id: offerObject.credential_configuration_ids?.[0] ?? cardId },
      ]),
    });
    const tokenResponse = await fetcher(`${issuerIdentifier}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) return fail(`token 失敗：HTTP ${tokenResponse.status}`);
    const token = await tokenResponse.json() as {
      access_token?: string; c_nonce?: string;
      authorization_details?: Array<{ credential_identifiers?: string[] }>;
    };
    if (!token.access_token || !token.c_nonce) return fail("token 回應缺少 access_token 或 c_nonce");
    step("token");

    // 5. A throwaway holder key, named the way the wallet names it.
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
    ) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
    const holderDid = jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: publicJwk.x!, y: publicJwk.y! });
    const header = { alg: "ES256", typ: "openid4vci-proof+jwt", kid: holderDid };
    const payload = {
      iss: "moda_dw",
      aud: `${issuerIdentifier}/`,
      iat: Math.floor(Date.now() / 1000),
      nonce: token.c_nonce,
    };
    const signingInput = `${b64urlJSON(header)}.${b64urlJSON(payload)}`;
    const proof = `${signingInput}.${await signES256(pair.privateKey, signingInput)}`;
    step("proof");

    // 6. The credential itself.
    const credentialResponse = await fetcher(metadata.credential_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
      body: JSON.stringify({
        credential_identifier: token.authorization_details?.[0]?.credential_identifiers?.[0] ?? cardId,
        proofs: { jwt: [proof] },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!credentialResponse.ok) return fail(`領卡失敗：HTTP ${credentialResponse.status}`);
    const issued = await credentialResponse.json() as {
      credential?: string; credentials?: Array<{ credential?: string }>;
    };
    const credential = issued.credentials?.[0]?.credential ?? issued.credential;
    if (typeof credential !== "string" || !credential.includes("~")) {
      return fail("領卡回應沒有 SD-JWT 憑證");
    }
    step("credential");

    // 7. Verify it exactly as a verifier would, trusting only this issuer.
    const identityResponse = await fetcher(`${origin}/api/issuer`, { signal: AbortSignal.timeout(10_000) });
    const identity = identityResponse.ok
      ? await identityResponse.json() as { didKey?: string }
      : {};
    const parts = credential.split("~");
    const disclosures = parts.slice(1).filter(Boolean);
    const verified = await verifyIssuerCredential(
      parts[0]!, disclosures, identity.didKey ? [identity.didKey] : [],
    );
    step("verify");
    if (!verified.ok) return fail(`憑證未通過驗證：${verified.reason ?? "未知原因"}`);
    if (verified.cnf?.x !== publicJwk.x) return fail("憑證的 cnf 未綁定本次的金鑰");

    return {
      ...base,
      ok: true,
      latencyMs: Date.now() - startedAll,
      detail: `完整流程通過（${disclosures.length} 個揭露欄位，撤銷狀態 ${verified.status ?? "unknown"}）`,
      data: {
        steps, cardId, personaId,
        disclosures: disclosures.length,
        revocationStatus: verified.status,
        credentialType: (verified.claims as { vc?: { type?: string[] } } | undefined)?.vc?.type?.[1],
      },
    };
  } catch (error) {
    return fail(`自檢中斷：${error instanceof Error ? error.message : "未知錯誤"}`);
  }
}
