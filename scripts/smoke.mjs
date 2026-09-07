#!/usr/bin/env node
// Live smoke test: play the wallet against a deployed (or local) issuer.
//
//   node scripts/smoke.mjs https://issuer.mashbean.net [cardId] [personaId]
//
// Walks the exact sequence the 有備而來 wallet performs — create an offer (as
// the web page would), fetch the offer object, read issuer metadata, redeem
// the pre-authorised code with client_id=moda_dw, build an
// `openid4vci-proof+jwt` whose kid is a jwk_jcs-pub did:key, fetch the card —
// then verifies the card the way the 請出示皮夾 verifier would (signature
// against the key inside `iss`, disclosure digests, cnf binding, live status
// list), and finally presents it back to the issuer's own presentation
// endpoint in the moda VP-JWT dialect. Prints one line per step.
//
// Self-contained on purpose: it depends on jose only, so it can be run against
// any deployment without the repository's TypeScript sources. Nothing here is
// a real person; the wallet key is thrown away at exit.

import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify, decodeJwt } from "jose";

const origin = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const cardId = process.argv[3] ?? "sandbox_driverlicense_car_v1";
const personaId = process.argv[4] ?? "wang-xiaoming";
const DEFINITION_ID = "take-this-card-vp";
const DESCRIPTOR_ID = "credential";

function step(name, detail = "") {
  console.log(`✓ ${name}${detail ? `  ${detail}` : ""}`);
}
async function expectOk(response, what) {
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${await response.text()}`);
  return response;
}

// ── did:key (jwk_jcs-pub) ─────────────────────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}
function base58Decode(s) {
  const bytes = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("bad base58");
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return Uint8Array.from(bytes.reverse());
}
function jwkJcsPubDid(jwk) {
  const payload = new TextEncoder().encode(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }));
  return "did:key:z" + base58Encode(Uint8Array.from([0xd1, 0xd6, 0x03, ...payload]));
}
function jwkFromDid(did) {
  const bytes = base58Decode(did.slice("did:key:z".length));
  if (bytes[0] !== 0xd1 || bytes[1] !== 0xd6 || bytes[2] !== 0x03) throw new Error("not a jwk_jcs-pub did:key");
  return JSON.parse(new TextDecoder().decode(bytes.slice(3)));
}
const b64urlToText = (s) => Buffer.from(s, "base64url").toString("utf8");
const sha256b64url = async (text) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("base64url");

// ── 1. issuer identity and an offer (what the page does) ─────────────────
const issuer = await (await expectOk(await fetch(`${origin}/api/issuer`), "GET /api/issuer")).json();
step("issuer identity", issuer.didKey.slice(0, 32) + "…");

const offer = await (await expectOk(await fetch(`${origin}/api/offers`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ cardId, personaId, wallet: "bonds" }),
}), "POST /api/offers")).json();
step("offer created", offer.qr);

// ── 2. wallet: parse deep link, fetch offer by reference ─────────────────
const offerUri = new URL(offer.qr.replace(/^openid-credential-offer:\/\//, "https://x/")).searchParams.get("credential_offer_uri");
const offerObject = await (await expectOk(await fetch(offerUri), "GET credential_offer_uri")).json();
const grant = offerObject.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"];
if (!grant?.["pre-authorized_code"]) throw new Error("offer has no pre-authorized code");
step("offer object", `credential_issuer=${offerObject.credential_issuer} ids=${offerObject.credential_configuration_ids}`);

// ── 3. wallet: metadata (only credential_endpoint is read) ───────────────
const issuerIdentifier = offerObject.credential_issuer.replace(/\/$/, "");
const metadata = await (await expectOk(await fetch(`${issuerIdentifier}/.well-known/openid-credential-issuer`), "metadata")).json();
if (new URL(metadata.credential_endpoint).host !== new URL(issuerIdentifier).host) throw new Error("credential_endpoint host mismatch");
step("issuer metadata", metadata.credential_endpoint);

// ── 4. wallet: token with client_id=moda_dw ──────────────────────────────
const form = new URLSearchParams({
  grant_type: "urn:ietf:params:oauth:grant-type:pre-authorized_code",
  "pre-authorized_code": grant["pre-authorized_code"],
  client_id: "moda_dw",
  authorization_details: JSON.stringify([{ type: "openid_credential", credential_configuration_id: offerObject.credential_configuration_ids[0] }]),
});
const token = await (await expectOk(await fetch(`${issuerIdentifier}/token`, {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
}), "POST /token")).json();
if (!token.access_token || !token.c_nonce) throw new Error("token response lacks access_token or c_nonce");
step("token", `c_nonce=${token.c_nonce.slice(0, 8)}…`);

const replay = await fetch(`${issuerIdentifier}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
if (replay.ok) throw new Error("pre-authorized code was accepted twice");
step("code is one-time", `replay → HTTP ${replay.status}`);

// ── 5. wallet: proof with kid = jwk_jcs-pub did:key, aud = identifier + "/"
const holder = await generateKeyPair("ES256", { extractable: true });
const holderJwk = await exportJWK(holder.publicKey);
const holderDid = jwkJcsPubDid({ kty: "EC", crv: "P-256", x: holderJwk.x, y: holderJwk.y });
const proof = await new SignJWT({ iss: "moda_dw", aud: `${issuerIdentifier}/`, nonce: token.c_nonce })
  .setProtectedHeader({ typ: "openid4vci-proof+jwt", alg: "ES256", kid: holderDid })
  .setIssuedAt()
  .sign(holder.privateKey);
const credentialResponse = await (await expectOk(await fetch(metadata.credential_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
  body: JSON.stringify({ credential_identifier: token.authorization_details?.[0]?.credential_identifiers?.[0] ?? cardId, proofs: { jwt: [proof] } }),
}), "POST /credential")).json();
const credential = credentialResponse.credentials?.[0]?.credential ?? credentialResponse.credential;
if (typeof credential !== "string" || !credential.includes("~")) throw new Error("no SD-JWT credential in response");
const parts = credential.split("~");
const disclosures = parts.slice(1).filter(Boolean);
step("credential issued", `${credential.length} chars, ${disclosures.length} disclosures, trailing ~ = ${credential.endsWith("~")}`);

// ── 6. verify as the wallet reader / verifier would ──────────────────────
const jws = parts[0];
const payload = decodeJwt(jws);
if (payload.iss !== issuer.didKey) throw new Error("iss is not the published issuer DID");
const issuerKey = await importJWK(jwkFromDid(payload.iss), "ES256");
await jwtVerify(jws, issuerKey);
const subjectDigests = new Set(payload.vc.credentialSubject._sd);
const revealed = {};
for (const d of disclosures) {
  if (!subjectDigests.has(await sha256b64url(d))) throw new Error("a disclosure digest is not committed in _sd");
  const [, name, value] = JSON.parse(b64urlToText(d));
  revealed[name] = value;
}
if (payload.cnf?.jwk?.x !== holderJwk.x || payload.cnf?.jwk?.y !== holderJwk.y) throw new Error("cnf is not bound to the wallet key");
if (payload.sub !== holderDid) throw new Error("sub is not the holder did");
if (payload.vc.type[1] !== cardId) throw new Error("vc.type[1] is not the card id");
step("credential verifies", `sig via iss did:key, ${Object.keys(revealed).length} claims, name=${revealed.name ?? "(none)"}, type=${payload.vc.type[1]}`);

const statusRef = payload.vc.credentialStatus;
const statusJwt = (await (await expectOk(await fetch(statusRef.statusListCredential), "GET status list")).text()).trim();
const statusPayload = decodeJwt(statusJwt);
await jwtVerify(statusJwt, await importJWK(jwkFromDid(statusPayload.iss), "ES256"));
if (statusPayload.sub !== statusRef.statusListCredential) throw new Error("status list sub != uri");
const listBytes = new Uint8Array(await new Response(new Response(Buffer.from(statusPayload.vc.credentialSubject.encodedList, "base64")).body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
const idx = Number(statusRef.statusListIndex);
const revoked = (listBytes[idx >> 3] & (0x80 >> (idx & 7))) !== 0;
if (revoked) throw new Error("freshly issued card reads as revoked");
step("status list", `index ${idx} of ${listBytes.length * 8} → valid`);

// ── 7. present it back in the moda dialect ───────────────────────────────
const presentation = await (await expectOk(await fetch(`${origin}/api/presentations`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId }),
}), "POST /api/presentations")).json();
const requestJwt = await (await expectOk(await fetch(presentation.requestUri), "GET request_uri")).text();
await jwtVerify(requestJwt, await importJWK(jwkFromDid(presentation.clientId), "ES256"));
const requestPayload = decodeJwt(requestJwt);
const requested = requestPayload.presentation_definition.input_descriptors[0].constraints.fields
  .map((field) => field.path[0]).filter((path) => path.startsWith("$.credentialSubject."))
  .map((path) => path.slice("$.credentialSubject.".length));
step("presentation request", `signed by client_id, claims=${requested.join(",")}`);

const shown = disclosures.filter((d) => requested.includes(JSON.parse(b64urlToText(d))[1]));
const presented = `${jws}~${shown.map((d) => `${d}~`).join("")}`;
const vpToken = await new SignJWT({
  iss: holderDid, sub: holderDid, nonce: requestPayload.nonce,
  vp: { context: ["https://www.w3.org/2018/credentials/v1"], type: ["VerifiablePresentation"], verifiableCredential: [presented] },
}).setProtectedHeader({ alg: "ES256", typ: "JWT", jwk: { kty: "EC", crv: "P-256", x: holderJwk.x, y: holderJwk.y } })
  .setAudience(requestPayload.client_id).setIssuedAt().setExpirationTime("10m").sign(holder.privateKey);
const submission = {
  id: crypto.randomUUID(), definition_id: DEFINITION_ID,
  descriptor_map: [{ id: DESCRIPTOR_ID, format: "jwt_vp", path: "$", path_nested: { id: DESCRIPTOR_ID, format: "jwt_vc", path: "$.vp.verifiableCredential[0]" } }],
};
const responseBody = new URLSearchParams({ vp_token: vpToken, presentation_submission: JSON.stringify(submission), state: requestPayload.state });
const outcome = await (await expectOk(await fetch(requestPayload.response_uri, {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: responseBody,
}), "POST response_uri")).json();
if (outcome.status !== "verified") throw new Error(`presentation not verified: ${JSON.stringify(outcome)}`);
step("presentation verified", `disclosed ${shown.length}/${disclosures.length}`);

console.log(`\nall steps passed against ${origin}`);
