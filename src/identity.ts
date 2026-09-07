// The issuer's own signing identity.
//
// One P-256 keypair, generated on first use inside a singleton Durable Object
// and never written to the repo, the config or a response. Its public half is
// the issuer `did:key` (in the `jwk_jcs-pub` spelling the 有備而來 wallet's
// `TWDIWCredentialReader` resolves), and it signs three things: the cards, the
// status list, and — for the embedded presentation demo — the OIDC4VP request
// object, where the same DID doubles as the verifier `client_id`.
//
// The object also keeps the status-list bookkeeping: the next free index and
// the set of revoked indexes. Web Crypto ECDSA/P-256 signatures are raw `r‖s`,
// which is what JOSE ES256 and CryptoKit both expect.

import { DurableObject } from "cloudflare:workers";
import { jwkJcsPubDidKey } from "./didkey";
import { STATUS_LIST_BITS, statusListJwt } from "./statuslist";

export interface PublicIdentity {
  didKey: string;
  publicJwk: { kty: string; crv: string; x: string; y: string };
}

export class IssuerIdentity extends DurableObject<Env> {

  private async ensure(): Promise<{ priv: JsonWebKey; pub: JsonWebKey; didKey: string }> {
    const storedPriv = await this.ctx.storage.get<JsonWebKey>("privateJwk");
    const storedPub = await this.ctx.storage.get<JsonWebKey>("publicJwk");
    const storedDid = await this.ctx.storage.get<string>("didKey");
    if (storedPriv && storedPub && storedDid) return { priv: storedPriv, pub: storedPub, didKey: storedDid };
    const pair = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const priv = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
    const didKey = jwkJcsPubDidKey({ kty: "EC", crv: "P-256", x: pub.x!, y: pub.y! });
    await this.ctx.storage.put({ privateJwk: priv, publicJwk: pub, didKey });
    return { priv, pub, didKey };
  }

  async identity(): Promise<PublicIdentity> {
    const { pub, didKey } = await this.ensure();
    return { didKey, publicJwk: { kty: pub.kty!, crv: pub.crv!, x: pub.x!, y: pub.y! } };
  }

  async sign(input: string): Promise<string> {
    if (input.length > 128_000) throw new Error("signing input is too large");
    const { priv } = await this.ensure();
    const key = await crypto.subtle.importKey("jwk", priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)),
    );
    let encoded = "";
    for (const byte of raw) encoded += String.fromCharCode(byte);
    return btoa(encoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** The next free status-list position. Wraps after 131,072 cards; a
   *  deployment that issues that many test cards should start a second list. */
  async allocateStatusIndex(): Promise<number> {
    const next = (await this.ctx.storage.get<number>("nextStatusIndex")) ?? 0;
    await this.ctx.storage.put("nextStatusIndex", (next + 1) % STATUS_LIST_BITS);
    return next;
  }

  async issuedCount(): Promise<number> {
    return (await this.ctx.storage.get<number>("nextStatusIndex")) ?? 0;
  }

  async revokedIndexes(): Promise<number[]> {
    return (await this.ctx.storage.get<number[]>("revoked")) ?? [];
  }

  /** Not routed over HTTP yet: an operator control for a future revocation demo. */
  async revoke(index: number): Promise<void> {
    if (!Number.isInteger(index) || index < 0 || index >= STATUS_LIST_BITS) throw new Error("bad status index");
    const revoked = new Set(await this.revokedIndexes());
    revoked.add(index);
    await this.ctx.storage.put("revoked", [...revoked]);
  }

  async statusListJwt(listUrl: string): Promise<string> {
    const { didKey } = await this.ensure();
    return statusListJwt({ didKey, sign: (input) => this.sign(input) }, {
      listUrl,
      revoked: await this.revokedIndexes(),
    });
  }
}
