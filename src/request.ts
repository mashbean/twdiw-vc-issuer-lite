// The OIDC4VP Authorization Request for the embedded presentation demo.
//
// The 有備而來 wallet requires a request object that is a JWT signed by the key
// in `client_id` (a did:key), with `response_mode: direct_post`, a
// `response_uri` on a host the wallet trusts, and a Presentation Exchange
// `presentation_definition` (its `$.type` filter picks the card, the
// `$.credentialSubject.<claim>` paths become the disclosure toggles). The DCQL
// twin is kept beside it, as the 請出示皮夾 verifier does.

export const DEFINITION_ID = "take-this-card-vp";
export const DESCRIPTOR_ID = "credential";

export interface RequestSession {
  clientId: string;
  responseUri: string;
  nonce: string;
  state: string;
  credentialType: string;
  requestedClaims: string[];
  purpose?: { client: string; termsUri: string; scenario: string; purpose: string };
  expiresAtEpochSeconds?: number;
}

export function buildRequestPayload(session: RequestSession): Record<string, unknown> {
  return {
    client_id: session.clientId,
    iss: session.clientId,
    aud: session.clientId,
    ...(session.expiresAtEpochSeconds ? { exp: session.expiresAtEpochSeconds } : {}),
    response_type: "vp_token",
    response_mode: "direct_post",
    response_uri: session.responseUri,
    nonce: session.nonce,
    state: session.state,
    presentation_definition: {
      id: DEFINITION_ID,
      ...(session.purpose ? { purpose: JSON.stringify({
        client: session.purpose.client,
        terms_uri: session.purpose.termsUri,
        scenario: session.purpose.scenario,
        purpose: session.purpose.purpose,
      }) } : {}),
      input_descriptors: [{
        id: DESCRIPTOR_ID,
        format: { "vc+sd-jwt": { "sd-jwt_alg_values": ["ES256"], "kb-jwt_alg_values": ["ES256"] } },
        constraints: {
          fields: [
            { path: ["$.type"], filter: { type: "array", contains: { const: session.credentialType } } },
            ...session.requestedClaims.map((claim) => ({ path: [`$.credentialSubject.${claim}`] })),
          ],
          limit_disclosure: "required",
        },
      }],
    },
    client_metadata: {
      vp_formats: {
        jwt_vc: { alg: ["ES256"] },
        jwt_vp: { alg: ["ES256"] },
      },
      response_types: ["vp_token"],
    },
    dcql_query: {
      credentials: [{
        id: DESCRIPTOR_ID,
        format: "dc+sd-jwt",
        meta: { vct_values: [session.credentialType] },
        claims: session.requestedClaims.map((claim) => ({ path: ["vc", "credentialSubject", claim] })),
      }],
    },
  };
}

/** Deep search for a claim by key — TWDIW puts disclosed claims under
 *  `vc.credentialSubject`, and the verifier's reconstruction keeps them there. */
export function findClaim(node: unknown, name: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findClaim(item, name, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const object = node as Record<string, unknown>;
  if (name in object && object[name] !== undefined) return object[name];
  for (const value of Object.values(object)) {
    const found = findClaim(value, name, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function selectedClaims(claims: unknown, names: string[]): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const name of names) {
    const value = findClaim(claims, name);
    if (value !== undefined) selected[name] = value;
  }
  return selected;
}
