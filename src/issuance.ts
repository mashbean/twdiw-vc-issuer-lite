// One issuance: an offer, its pre-authorised code, the access token it turns
// into, and the card that finally goes out. Ten minutes, then gone.
//
// The Durable Object stores only what the flow needs to continue — which card
// for which fictional person, the code and token secrets, the nonce — and
// deletes itself the moment the card is issued or the alarm fires. The card
// itself is never stored: it goes to the wallet in the response and, as test
// data, to the browser that created the offer over the one-time result socket.

import { DurableObject } from "cloudflare:workers";
import { claimsFor, getCard, getPersona } from "./catalog";
import {
  ACCESS_TOKEN_LIFETIME_S,
  OFFER_TTL_MS,
  compoundToken,
  credentialOfferObject,
  randomSecret,
  timingSafeEqual,
  type WalletFamily,
} from "./offer";
import { issuerAudiences, verifyProofJwt } from "./proof";
import { isAuthorizedResultSocket, parseResultSubscription, resultKeysEqual } from "./result-channel";
import { mintTwdiwSdJwt } from "./sdjwt";

interface IssuanceState {
  id: string;
  cardId: string;
  personaId: string;
  wallet: WalletFamily;
  resultKey: string;
  codeSecret: string;
  createdAt: number;
  clientId?: string;
  accessSecret?: string;
  cNonce?: string;
  tokenAt?: number;
}

export interface IssuanceInit {
  id: string;
  cardId: string;
  personaId: string;
  wallet: WalletFamily;
  resultKey: string;
}

export type RedeemResult =
  | { ok: true; accessSecret: string; cNonce: string; cardId: string }
  | { ok: false; status: number; error: string; description: string };

export type IssueResult =
  | { ok: true; credential: string; cNonce: string }
  | { ok: false; status: number; error: string; description: string };

export interface IssuanceEvent {
  status: "progress" | "issued" | "failed" | "expired";
  step?: "offer" | "token" | "credential";
  reason?: string;
  cardId?: string;
  cardName?: string;
  cardKind?: string;
  personaId?: string;
  personaName?: string;
  credentialType?: string;
  jti?: string;
  issuedAt?: number;
  expiresAt?: number;
  claims?: Record<string, string>;
  clientId?: string;
  holderDid?: string;
  disclosureCount?: number;
  timingMs?: { proof: number; mint: number; total: number };
}

const MAX_RESULT_SOCKETS = 4;

export class IssuanceSession extends DurableObject<Env> {
  private async load(): Promise<IssuanceState | undefined> {
    return this.ctx.storage.get<IssuanceState>("issuance");
  }

  private async put(state: IssuanceState): Promise<void> {
    await this.ctx.storage.put("issuance", state);
  }

  async init(input: IssuanceInit): Promise<{ codeSecret: string; expiresAt: number }> {
    if (!getCard(input.cardId) || !getPersona(input.personaId)) throw new Error("unknown card or persona");
    const codeSecret = randomSecret();
    const createdAt = Date.now();
    await this.put({ ...input, codeSecret, createdAt });
    await this.ctx.storage.setAlarm(createdAt + OFFER_TTL_MS);
    return { codeSecret, expiresAt: createdAt + OFFER_TTL_MS };
  }

  /** The offer object, until the code is redeemed. Re-fetchable within its
   *  lifetime so a wallet that scans twice is not punished; the code itself is
   *  one-time. */
  async offerObject(origin: string): Promise<string | null> {
    const state = await this.load();
    if (!state || state.accessSecret) return null;
    await this.publish({ status: "progress", step: "offer" }, false);
    return JSON.stringify(credentialOfferObject(origin, state.cardId, compoundToken(state.id, state.codeSecret)));
  }

  async redeem(input: { secret: string; clientId: string }): Promise<RedeemResult> {
    const state = await this.load();
    if (!state) return { ok: false, status: 400, error: "invalid_grant", description: "pre-authorized code is unknown or expired" };
    if (state.accessSecret) return { ok: false, status: 400, error: "invalid_grant", description: "pre-authorized code was already redeemed" };
    if (!timingSafeEqual(input.secret, state.codeSecret)) {
      return { ok: false, status: 400, error: "invalid_grant", description: "pre-authorized code does not match" };
    }
    const accessSecret = randomSecret();
    const cNonce = randomSecret(16);
    await this.put({ ...state, accessSecret, cNonce, clientId: input.clientId.slice(0, 200), tokenAt: Date.now() });
    await this.publish({ status: "progress", step: "token", clientId: input.clientId.slice(0, 200) }, false);
    return { ok: true, accessSecret, cNonce, cardId: state.cardId };
  }

  async issue(input: { secret: string; proofJwt: string; origin: string; credentialIdentifier?: string }): Promise<IssueResult> {
    const startedAt = performance.now();
    const state = await this.load();
    if (!state || !state.accessSecret || !state.cNonce || !state.tokenAt) {
      return { ok: false, status: 401, error: "invalid_token", description: "access token is unknown or expired" };
    }
    if (!timingSafeEqual(input.secret, state.accessSecret)) {
      return { ok: false, status: 401, error: "invalid_token", description: "access token does not match" };
    }
    if (Date.now() - state.tokenAt > ACCESS_TOKEN_LIFETIME_S * 1000) {
      return { ok: false, status: 401, error: "invalid_token", description: "access token expired" };
    }
    if (input.credentialIdentifier && input.credentialIdentifier !== state.cardId) {
      return { ok: false, status: 400, error: "unsupported_credential_type", description: "credential_identifier is not the one offered" };
    }
    const card = getCard(state.cardId);
    const persona = getPersona(state.personaId);
    if (!card || !persona) return { ok: false, status: 500, error: "server_error", description: "offer refers to an unknown card" };

    const proofStarted = performance.now();
    const proof = await verifyProofJwt(input.proofJwt, { audiences: issuerAudiences(input.origin), nonce: state.cNonce });
    const proofMs = Math.round(performance.now() - proofStarted);
    if (!proof.ok) {
      await this.publish({ status: "failed", step: "credential", reason: proof.reason, cardId: state.cardId }, true);
      return { ok: false, status: 400, error: "invalid_proof", description: proof.reason };
    }

    const identity = this.env.IDENTITY.getByName("issuer");
    const { didKey } = await identity.identity();
    const statusIndex = await identity.allocateStatusIndex();
    const origin = input.origin.replace(/\/$/, "");
    const claims = claimsFor(card, persona);
    const mintStarted = performance.now();
    const minted = await mintTwdiwSdJwt({
      signer: { didKey, sign: (signingInput) => identity.sign(signingInput) },
      holderJwk: proof.holderJwk,
      holderDid: proof.holderDid,
      credentialType: card.id,
      claims,
      origin,
      statusListUrl: `${origin}/status/1`,
      statusIndex,
      validitySeconds: card.validityDays * 86_400,
    });
    const mintMs = Math.round(performance.now() - mintStarted);

    await this.publish({
      status: "issued",
      cardId: card.id,
      cardName: card.name,
      cardKind: card.kind,
      personaId: persona.id,
      personaName: persona.name,
      credentialType: card.id,
      jti: minted.jti,
      issuedAt: minted.issuedAt,
      expiresAt: minted.expiresAt,
      claims,
      clientId: state.clientId,
      holderDid: proof.holderDid,
      disclosureCount: minted.disclosures.length,
      timingMs: { proof: proofMs, mint: mintMs, total: Math.round(performance.now() - startedAt) },
    }, true);
    return { ok: true, credential: minted.serialized, cNonce: randomSecret(16) };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!await this.load()) return new Response("gone", { status: 404 });
    if (this.ctx.getWebSockets().length >= MAX_RESULT_SOCKETS) {
      return new Response("too many result subscribers", { status: 429 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.serializeAttachment({ authorized: false });
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      socket.close(1003, "text messages only");
      return;
    }
    const subscription = parseResultSubscription(message);
    const state = await this.load();
    if (!subscription || !state || !resultKeysEqual(subscription.resultKey, state.resultKey)) {
      socket.close(1008, "invalid result capability");
      return;
    }
    socket.serializeAttachment({ authorized: true });
    socket.send(JSON.stringify({ status: "ready" }));
  }

  private async publish(event: IssuanceEvent, final: boolean): Promise<void> {
    const serialized = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      if (!isAuthorizedResultSocket(socket) || socket.readyState !== WebSocket.OPEN) continue;
      socket.send(serialized);
      if (final) socket.close(1000, "issuance complete");
    }
    if (final) await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    await this.publish({ status: "expired" }, true);
  }
}
