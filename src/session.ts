// One short-lived OpenID4VP presentation session for the embedded demo: the
// card this issuer just handed out is presented straight back, and verified
// against this issuer's own DID. The request and response travel over HTTP,
// the Worker's calls into this Durable Object use RPC.
//
// Trust policy, stated plainly: this verifier trusts exactly one issuer —
// itself. It is a demonstration that the card is well-formed and bound to the
// wallet's key, not a claim that anybody else should accept the card.

import { DurableObject } from "cloudflare:workers";
import { claimLabel, getCard } from "./catalog";
import { verifyModaVpToken } from "./moda";
import { validatePresentationSubmission } from "./presentation-submission";
import { DEFINITION_ID, DESCRIPTOR_ID, buildRequestPayload, selectedClaims } from "./request";
import { isAuthorizedResultSocket, parseResultSubscription, resultKeysEqual } from "./result-channel";
import { b64urlJSON } from "./sdjwt";
import { verifySdJwtVc } from "./verify";

interface SessionState {
  nonce: string;
  state: string;
  resultKey: string;
  clientId: string;
  responseUri: string;
  cardId: string;
  requestedClaims: string[];
  createdAt: number;
}

export interface SessionInit {
  clientId: string;
  responseUri: string;
  resultKey: string;
  cardId: string;
}

export interface PresentationResult {
  status: "verified" | "failed" | "gone";
  reason?: string;
  cardId?: string;
  cardName?: string;
  credentialType?: string;
  issuer?: string;
  issuerIsThisSite?: boolean;
  requestedClaims?: Array<{ name: string; label: string }>;
  claims?: Record<string, unknown>;
  withheld?: string[];
  credentialStatus?: string;
  credentialStatusReason?: string;
  holderBound?: boolean;
  timingMs?: { credential: number; total: number };
}

const TTL_MS = 10 * 60 * 1000;
const MAX_RESPONSE_CHARS = 512_000;
const MAX_RESULT_SOCKETS = 4;

export class PresentationSession extends DurableObject<Env> {
  private async load(): Promise<SessionState | undefined> {
    return this.ctx.storage.get<SessionState>("session");
  }

  async init(input: SessionInit): Promise<{ nonce: string; state: string }> {
    const card = getCard(input.cardId);
    if (!card) throw new Error("unknown card");
    const nonce = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const state = crypto.randomUUID();
    await this.ctx.storage.put("session", {
      nonce,
      state,
      resultKey: input.resultKey,
      clientId: input.clientId,
      responseUri: input.responseUri,
      cardId: card.id,
      requestedClaims: [...card.presentClaims],
      createdAt: Date.now(),
    } satisfies SessionState);
    await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
    return { nonce, state };
  }

  async requestObject(): Promise<string | null> {
    const session = await this.load();
    if (!session) return null;
    const card = getCard(session.cardId);
    const header = {
      typ: "oauth-authz-req+jwt",
      alg: "ES256",
      kid: `${session.clientId}#0`,
    };
    const signingInput = `${b64urlJSON(header)}.${b64urlJSON(buildRequestPayload({
      clientId: session.clientId,
      responseUri: session.responseUri,
      nonce: session.nonce,
      state: session.state,
      credentialType: session.cardId,
      requestedClaims: session.requestedClaims,
      purpose: {
        client: "請收下卡片",
        termsUri: `${new URL(session.responseUri).origin}/#present`,
        scenario: card ? `出示測試：${card.name}` : "出示測試",
        purpose: "把剛領到的測試卡片出示回發卡站，確認簽章、持有人綁定與選擇性揭露",
      },
      expiresAtEpochSeconds: Math.floor((session.createdAt + TTL_MS) / 1000),
    }))}`;
    const identity = this.env.IDENTITY.getByName("issuer");
    return `${signingInput}.${await identity.sign(signingInput)}`;
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
    const session = await this.load();
    if (!subscription || !session || !resultKeysEqual(subscription.resultKey, session.resultKey)) {
      socket.close(1008, "invalid result capability");
      return;
    }
    socket.serializeAttachment({ authorized: true });
    socket.send(JSON.stringify({ status: "ready" }));
  }

  private async publish(result: PresentationResult): Promise<void> {
    const serialized = JSON.stringify(result);
    for (const socket of this.ctx.getWebSockets()) {
      if (!isAuthorizedResultSocket(socket) || socket.readyState !== WebSocket.OPEN) continue;
      socket.send(serialized);
      socket.close(1000, "verification complete");
    }
    // The nonce, the capability and the request metadata go now. The
    // presentation itself and the disclosed values were never written here.
    await this.ctx.storage.deleteAll();
  }

  private async fail(session: SessionState, reason: string, startedAt: number): Promise<{ status: string; reason: string }> {
    await this.publish({
      status: "failed",
      reason,
      cardId: session.cardId,
      timingMs: { credential: 0, total: Math.round(performance.now() - startedAt) },
    });
    return { status: "failed", reason };
  }

  async submit(serializedForm: string): Promise<{ status: string; reason?: string }> {
    const startedAt = performance.now();
    const session = await this.load();
    if (!session) return { status: "gone", reason: "session expired" };
    if (serializedForm.length > MAX_RESPONSE_CHARS) return this.fail(session, "presentation response is too large", startedAt);

    const form = new URLSearchParams(serializedForm);
    const vpToken = form.get("vp_token") ?? "";
    const submissionError = validatePresentationSubmission(
      form.get("presentation_submission") ?? "",
      "government",
      DEFINITION_ID,
      DESCRIPTOR_ID,
      1,
    );
    if (submissionError) return this.fail(session, submissionError, startedAt);
    if (form.get("state") !== session.state) return this.fail(session, "state mismatch", startedAt);
    if (!vpToken) return this.fail(session, "no vp_token in response", startedAt);

    const identity = await this.env.IDENTITY.getByName("issuer").identity();
    const trustedIssuers = [identity.didKey];
    const credentialStarted = performance.now();
    const result = vpToken.includes("~")
      ? await verifySdJwtVc(vpToken, { expectedNonce: session.nonce, expectedAudience: session.clientId, trustedIssuers })
      : await verifyModaVpToken(vpToken, { expectedNonce: session.nonce, expectedAudience: session.clientId, trustedIssuers });
    const credentialMs = Math.round(performance.now() - credentialStarted);
    if (!result.ok) return this.fail(session, result.reason ?? "credential verification failed", startedAt);

    const card = getCard(session.cardId);
    const claims = selectedClaims(result.claims, session.requestedClaims);
    const vc = (result.claims as { vc?: { type?: unknown } } | undefined)?.vc;
    const types = Array.isArray(vc?.type) ? vc.type.map(String) : [];
    const credentialType = types.find((type) => type !== "VerifiableCredential") ?? result.vct;
    if (credentialType !== session.cardId) {
      return this.fail(session, `presented card type ${credentialType ?? "(none)"} is not the requested ${session.cardId}`, startedAt);
    }
    await this.publish({
      status: "verified",
      cardId: session.cardId,
      cardName: card?.name,
      credentialType,
      issuer: result.issuer,
      issuerIsThisSite: result.issuer === identity.didKey,
      requestedClaims: session.requestedClaims.map((name) => ({ name, label: claimLabel(name) })),
      claims,
      withheld: session.requestedClaims.filter((name) => !(name in claims)),
      credentialStatus: result.status,
      credentialStatusReason: result.statusReason,
      holderBound: "holderBound" in result ? Boolean(result.holderBound) : result.keyBound,
      timingMs: { credential: credentialMs, total: Math.round(performance.now() - startedAt) },
    });
    return { status: "verified" };
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
