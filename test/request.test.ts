import { describe, expect, it } from "vitest";
import { DEFINITION_ID, DESCRIPTOR_ID, buildRequestPayload, findClaim, selectedClaims } from "../src/request";

const session = {
  clientId: "did:key:z2dmzIssuer",
  responseUri: "https://issuer.test/api/response/abc",
  nonce: "nonce",
  state: "state",
  credentialType: "sandbox_telecom_msisdn_v1",
  requestedClaims: ["name", "phonel5"],
  purpose: { client: "請收下卡片", termsUri: "https://issuer.test/#present", scenario: "出示測試", purpose: "驗回自己的卡" },
  expiresAtEpochSeconds: 1_800_000_000,
};

describe("the presentation request", () => {
  it("is what the 有備而來 OID4VPRequest.verify reads: direct_post, response_uri, nonce, state, a definition with descriptors", () => {
    const payload = buildRequestPayload(session) as any;
    expect(payload.client_id).toBe(session.clientId);
    expect(payload.iss).toBe(session.clientId);
    expect(payload.response_mode).toBe("direct_post");
    expect(payload.response_uri).toBe(session.responseUri);
    expect(payload.nonce).toBe("nonce");
    expect(payload.state).toBe("state");
    expect(payload.exp).toBe(1_800_000_000);
    expect(payload.presentation_definition.id).toBe(DEFINITION_ID);
    const descriptor = payload.presentation_definition.input_descriptors[0];
    expect(descriptor.id).toBe(DESCRIPTOR_ID);
    expect(descriptor.constraints.limit_disclosure).toBe("required");
  });

  it("selects the card by a $.type filter and names each claim under $.credentialSubject", () => {
    const descriptor = (buildRequestPayload(session) as any).presentation_definition.input_descriptors[0];
    const paths = descriptor.constraints.fields.map((field: { path: string[] }) => field.path[0]);
    expect(paths).toEqual(["$.type", "$.credentialSubject.name", "$.credentialSubject.phonel5"]);
    expect(descriptor.constraints.fields[0].filter.contains.const).toBe("sandbox_telecom_msisdn_v1");
  });

  it("keeps the DCQL twin beside Presentation Exchange", () => {
    const payload = buildRequestPayload(session) as any;
    const credential = payload.dcql_query.credentials[0];
    expect(credential.format).toBe("dc+sd-jwt");
    expect(credential.meta.vct_values).toEqual(["sandbox_telecom_msisdn_v1"]);
    expect(credential.claims.map((claim: { path: string[] }) => claim.path.at(-1))).toEqual(["name", "phonel5"]);
  });

  it("carries the purpose as the JSON string the wallets display", () => {
    const payload = buildRequestPayload(session) as any;
    expect(JSON.parse(payload.presentation_definition.purpose)).toEqual({
      client: "請收下卡片", terms_uri: "https://issuer.test/#present", scenario: "出示測試", purpose: "驗回自己的卡",
    });
  });
});

describe("claim selection", () => {
  const claims = { iss: "x", vc: { type: ["VerifiableCredential", "t"], credentialSubject: { name: "王小明", phonel5: "00101" } } };

  it("finds a claim wherever the reconstruction left it", () => {
    expect(findClaim(claims, "name")).toBe("王小明");
    expect(findClaim(claims, "missing")).toBeUndefined();
    expect(findClaim(null, "name")).toBeUndefined();
  });

  it("returns only the requested claims and omits withheld ones", () => {
    expect(selectedClaims(claims, ["name", "phone_number"])).toEqual({ name: "王小明" });
  });
});
