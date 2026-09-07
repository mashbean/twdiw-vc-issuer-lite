#!/usr/bin/env node
// Live smoke test: play the wallet against a deployed issuer.
//
//   node scripts/smoke.mjs https://issuer.mashbean.net [cardId] [personaId]
//
// Walks the exact sequence the 有備而來 wallet performs — create an offer (as
// the web page would), fetch the offer object, read issuer metadata, redeem
// the pre-authorised code with client_id=moda_dw, build an
// `openid4vci-proof+jwt` whose kid is a jwk_jcs-pub did:key, fetch the card —
// then verifies the card locally against the issuer's published DID and the
// live status list, and finally presents it back to the issuer's own
// presentation endpoint in the moda VP-JWT dialect. Prints one line per step.
// Nothing here is a real person; the wallet key is thrown away at exit.

import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { verifyIssuerCredential } from "../src/verify.ts";
import { jwkJcsPubDidKey } from "../src/didkey.ts";
import { DEFINITION_ID, DESCRIPTOR_ID } from "../src/request.ts";

const origin = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const cardId = process.argv[3] ?? "sandbox_driverlicense_car_v1";
const personaId = process.argv[4] ?? "wang-xiaoming";

function step(name, detail = "") {
  console.log(`✓ ${name}${detail ? `  ${detail}` : ""}`);
}
async function expectOk(response, what) {
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${await response.text()}`);
  return response;
}

const issuer = await (await expectOk(await fetch(`${origin}/api/issuer`), "GET /api/issuer")).json();
step("issuer identity", issuer.didKey.slice(0, 32) + "…");

const offer = await (await expectOk(await fetch(`${origin}/api/offers`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ cardId, personaId, wallet: "bonds" }),
}), "POST /api/offers")).json();
step("offer created", offer.qr);

// Wallet: parse the deep link, fetch the offer by reference.
const offerUri = new URL(offer.qr.replace(/^openid-credential-offer:\/\//, "https://x/")).searchParams.get("credential_offer_uri");
const offerObject = await (await expectOk(await fetch(offerUri), "GET credential_offer_uri")).json();
const grant = offerObject.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"];
if (!grant?.["pre-authorized_code"]) throw new Error("offer has no pre-authorized code");
step("offer object", `credential_issuer=${offerObject.credential_issuer} ids=${offerObject.credential_configuration_ids}`);

// Wallet: canonical issuer identifier → metadata; only credential_endpoint is read.
const issuerIdentifier = offerObject.credential_issuer.replace(/\/$/, "");
const metadata = await (await expectOk(await fetch(`${issuerIdentifier}/.well-known/openid-credential-issuer`), "metadata")).json();
if (new URL(metadata.credential_endpoint).host !== new URL(issuerIdentifier).host) throw new Error("credential_endpoint host mismatch");
step("issuer metadata", metadata.credential_endpoint);

// Wallet: token with client_id=moda_dw.
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

// A second redemption must fail: the code is one-time.
const replay = await fetch(`${issuerIdentifier}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
if (replay.ok) throw new Error("pre-authorized code was accepted twice");
step("code is one-time", `replay → HTTP ${replay.status}`);

// Wallet: one key per card, kid = jwk_jcs-pub did:key, aud = identifier + "/".
const holder = await generateKeyPair("ES256", { extractable: true });
const holderJwk = await exportJWK(holder.publicKey);
const holderDid = jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: holderJwk.x, y: holderJwk.y });
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
step("credential issued", `${credential.length} chars, ${credential.split("~").length - 2} disclosures`);

// Verify locally the way the verifier would, trusting only this issuer's DID,
// with the live status list.
const parts = credential.split("~");
const verified = await verifyIssuerCredential(parts[0], parts.slice(1).filter(Boolean), [issuer.didKey]);
if (!verified.ok) throw new Error(`credential does not verify: ${verified.reason}`);
const subject = verified.claims.vc.credentialSubject;
step("credential verifies", `iss=this issuer, status=${verified.status}, name=${subject.name}, keys=${Object.keys(subject).length}`);
const cnfX = verified.cnf?.x;
if (cnfX !== holderJwk.x) throw new Error("cnf is not bound to the wallet key");
step("holder binding", "cnf.jwk equals the proof key");

// Present it back: create a presentation session, fetch the signed request,
// answer with a moda-dialect VP JWT that discloses only the requested claims.
const presentation = await (await expectOk(await fetch(`${origin}/api/presentations`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId }),
}), "POST /api/presentations")).json();
const requestJwt = await (await expectOk(await fetch(presentation.requestUri), "GET request_uri")).text();
const requestPayload = JSON.parse(Buffer.from(requestJwt.split(".")[1], "base64url").toString("utf8"));
const requested = requestPayload.presentation_definition.input_descriptors[0].constraints.fields
  .map((field) => field.path[0]).filter((path) => path.startsWith("$.credentialSubject."))
  .map((path) => path.slice("$.credentialSubject.".length));
step("presentation request", `client_id=${presentation.clientId.slice(0, 24)}… claims=${requested.join(",")}`);

const disclosures = parts.slice(1).filter(Boolean);
const shown = disclosures.filter((d) => requested.includes(JSON.parse(Buffer.from(d, "base64url").toString("utf8"))[1]));
const presented = `${parts[0]}~${shown.map((d) => `${d}~`).join("")}`;
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

console.log("\nall steps passed against", origin);
