// A StatusList2021 credential for the cards this issuer mints.
//
// TWDIW cards reference revocation through `vc.credentialStatus`, and the
// 請出示皮夾 verifier resolves that reference: it fetches the list JWT, verifies
// it against the `iss` did:key, checks `sub` equals the list URL, gunzips
// `credentialSubject.encodedList` and reads the bit at `statusListIndex`,
// MSB-first. Publishing a real list here lets a card from this issuer show
// 「狀態清單確認為有效」 instead of `unknown`, and gives a future revocation
// control something to flip.
//
// The bitstring is 16 KiB (131,072 entries), the minimum the W3C spec asks for
// so the position of one card in the list says little about how many exist.

import { b64urlJSON, type Signer } from "./sdjwt";

export const STATUS_LIST_BITS = 131_072;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function standardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** gzip + base64 of the bitstring, 1 = revoked, MSB-first within each byte. */
export async function encodedList(revoked: Iterable<number>): Promise<string> {
  const bytes = new Uint8Array(STATUS_LIST_BITS / 8);
  for (const index of revoked) {
    if (!Number.isInteger(index) || index < 0 || index >= STATUS_LIST_BITS) continue;
    bytes[index >> 3] |= 0x80 >> (index & 7);
  }
  return standardBase64(await gzip(bytes));
}

export async function statusListJwt(
  signer: Signer,
  opts: { listUrl: string; revoked: Iterable<number>; nowMs?: number },
): Promise<string> {
  const iat = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: `${signer.didKey}#0` };
  const payload = {
    iss: signer.didKey,
    sub: opts.listUrl,
    iat,
    nbf: iat,
    exp: iat + 3_600,
    vc: {
      "@context": ["https://www.w3.org/2018/credentials/v1", "https://w3id.org/vc/status-list/2021/v1"],
      type: ["VerifiableCredential", "StatusList2021Credential"],
      issuer: signer.didKey,
      issuanceDate: new Date(iat * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      credentialSubject: {
        id: `${opts.listUrl}#list`,
        type: "StatusList2021",
        statusPurpose: "revocation",
        encodedList: await encodedList(opts.revoked),
      },
    },
  };
  const signingInput = `${b64urlJSON(header)}.${b64urlJSON(payload)}`;
  return `${signingInput}.${await signer.sign(signingInput)}`;
}
