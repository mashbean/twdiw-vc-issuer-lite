import { describe, expect, it } from "vitest";
import { CARD_TYPES } from "../src/catalog";
import {
  PRE_AUTHORIZED_GRANT,
  authorizationServerMetadata,
  compoundToken,
  credentialOfferObject,
  issuerMetadata,
  offerDeepLink,
  parseCredentialRequest,
  parseTokenRequest,
  randomSecret,
  splitCompoundToken,
  timingSafeEqual,
  tokenResponse,
} from "../src/offer";

const ORIGIN = "https://issuer.test";

describe("the credential offer", () => {
  it("has exactly the fields the wallet's CredentialOffer.parse requires, and no tx_code", () => {
    const offer = credentialOfferObject(`${ORIGIN}/`, "sandbox_student_card_v1", "code");
    expect(offer.credential_issuer).toBe(ORIGIN);
    expect(offer.credential_configuration_ids).toEqual(["sandbox_student_card_v1"]);
    expect(offer.grants[PRE_AUTHORIZED_GRANT]["pre-authorized_code"]).toBe("code");
    expect("tx_code" in offer.grants[PRE_AUTHORIZED_GRANT]).toBe(false);
    expect(Object.keys(offer.grants)).toEqual([PRE_AUTHORIZED_GRANT]);
  });

  it("uses the standard scheme for 有備而來 and the official scheme for 數位憑證皮夾", () => {
    const uri = `${ORIGIN}/api/offer/abc`;
    expect(offerDeepLink("bonds", uri)).toBe(`openid-credential-offer://?credential_offer_uri=${encodeURIComponent(uri)}`);
    expect(offerDeepLink("twdiw", uri)).toBe(`modadigitalwallet://credential_offer?credential_offer_uri=${encodeURIComponent(uri)}`);
  });
});

describe("issuer metadata", () => {
  it("puts the credential endpoint on the same host as the issuer, as the wallet demands", () => {
    const metadata = issuerMetadata(ORIGIN, CARD_TYPES);
    expect(metadata.credential_issuer).toBe(ORIGIN);
    expect(new URL(metadata.credential_endpoint).host).toBe(new URL(ORIGIN).host);
    expect(metadata.token_endpoint).toBe(`${ORIGIN}/token`);
    for (const card of CARD_TYPES) {
      const configuration = metadata.credential_configurations_supported[card.id];
      expect(configuration.format).toBe("vc+sd-jwt");
      expect(configuration.credential_definition.type).toEqual(["VerifiableCredential", card.id]);
      expect(configuration.display[0].name).toBe(card.name);
    }
    expect(authorizationServerMetadata(ORIGIN).grant_types_supported).toEqual([PRE_AUTHORIZED_GRANT]);
  });
});

describe("compound codes and tokens", () => {
  it("round-trip an id and a secret and reject anything else", () => {
    const id = crypto.randomUUID();
    const secret = randomSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(splitCompoundToken(compoundToken(id, secret))).toEqual({ id, secret });
    expect(splitCompoundToken("not-a-token")).toBeNull();
    expect(splitCompoundToken(`${id}.short`)).toBeNull();
    expect(splitCompoundToken(undefined)).toBeNull();
  });

  it("compares secrets in constant time and never equates different lengths", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("the token request the wallet sends", () => {
  const form = new URLSearchParams({
    grant_type: PRE_AUTHORIZED_GRANT,
    "pre-authorized_code": "id.secret",
    client_id: "moda_dw",
    authorization_details: JSON.stringify([{ type: "openid_credential", credential_configuration_id: "sandbox_student_card_v1" }]),
  });

  it("is accepted with client_id=moda_dw and the configuration id read from authorization_details", () => {
    const parsed = parseTokenRequest(form);
    expect(parsed).toEqual({ ok: true, code: "id.secret", clientId: "moda_dw", configurationId: "sandbox_student_card_v1" });
  });

  it("refuses other grant types, a missing code and a tx_code", () => {
    expect(parseTokenRequest(new URLSearchParams({ grant_type: "authorization_code", code: "x" })).ok).toBe(false);
    expect(parseTokenRequest(new URLSearchParams({ grant_type: PRE_AUTHORIZED_GRANT })).ok).toBe(false);
    const withTx = new URLSearchParams(form);
    withTx.set("tx_code", "1234");
    expect(parseTokenRequest(withTx).ok).toBe(false);
  });

  it("answers with access_token and c_nonce, which the wallet treats as mandatory", () => {
    const response = tokenResponse("id.access", "nonce", "sandbox_student_card_v1");
    expect(response.access_token).toBe("id.access");
    expect(response.c_nonce).toBe("nonce");
    expect(response.token_type).toBe("Bearer");
    expect(response.authorization_details[0].credential_identifiers).toEqual(["sandbox_student_card_v1"]);
  });
});

describe("the credential request the wallet sends", () => {
  it("reads draft-15 proofs.jwt[0] plus credential_identifier", () => {
    const parsed = parseCredentialRequest({ credential_identifier: "sandbox_student_card_v1", proofs: { jwt: ["a.b.c"] } });
    expect(parsed).toEqual({ ok: true, proofJwt: "a.b.c", credentialIdentifier: "sandbox_student_card_v1" });
  });

  it("also reads the older single proof object", () => {
    const parsed = parseCredentialRequest({ credential_configuration_id: "x", proof: { proof_type: "jwt", jwt: "a.b.c" } });
    expect(parsed).toEqual({ ok: true, proofJwt: "a.b.c", credentialIdentifier: "x" });
  });

  it("refuses a request without a proof or with several proofs", () => {
    expect(parseCredentialRequest({ credential_identifier: "x" }).ok).toBe(false);
    expect(parseCredentialRequest({ proofs: { jwt: ["a", "b"] } }).ok).toBe(false);
    expect(parseCredentialRequest("nope").ok).toBe(false);
  });
});
