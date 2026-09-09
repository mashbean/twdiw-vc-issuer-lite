import qrcode from "qrcode-generator";
import { CARD_TYPES, getCard, getPersona, publicCatalog, claimsFor } from "./catalog";
import { FRONTEND_CSS, FRONTEND_HTML, FRONTEND_JS } from "./frontend";
import { IssuerIdentity } from "./identity";
import { IssuanceSession } from "./issuance";
import {
  OFFER_TTL_MS,
  authorizationServerMetadata,
  compoundToken,
  isWalletFamily,
  issuerIdentifier,
  issuerMetadata,
  offerDeepLink,
  parseCredentialRequest,
  parseTokenRequest,
  splitCompoundToken,
  tokenResponse,
} from "./offer";
import { atomFeed, jsonFeed } from "./feed";
import { MIN_MANUAL_INTERVAL_MS, MonitorState } from "./monitor";
import { MONITOR_CSS, MONITOR_HTML, MONITOR_JS } from "./monitor-frontend";
import { PresentationSession } from "./session";
import { cachedOfficialTrustList, officialTrustFor } from "./trust";

export { IssuerIdentity, IssuanceSession, PresentationSession, MonitorState };

const MAX_JSON_BODY = 8_192;
const MAX_CREDENTIAL_BODY = 32_768;
const MAX_PRESENTATION_BODY = 512_000;

function publicOrigin(request: Request, env: Env): string {
  const configured = env.ISSUER_ORIGIN?.trim();
  return configured ? configured.replace(/\/$/, "") : new URL(request.url).origin;
}

function securityHeaders(request: Request): HeadersInit {
  const headers: Record<string, string> = {
    "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
  if (new URL(request.url).protocol === "https:") headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

function respond(request: Request, body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(securityHeaders(request))) headers.set(name, value);
  return new Response(body, { ...init, headers });
}

function json(request: Request, value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return respond(request, JSON.stringify(value), { ...init, headers });
}

function oauthError(request: Request, status: number, error: string, description: string): Response {
  return json(request, { error, error_description: description }, { status });
}

function staticAsset(request: Request, body: string, type: string): Response {
  return respond(request, body, {
    headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "public, max-age=300" },
  });
}

function qrSvg(payload: string): string {
  const code = qrcode(0, "M");
  code.addData(payload);
  code.make();
  return code.createSvgTag(5, 8);
}

function validSessionId(value: string): boolean {
  return /^[0-9a-f-]{36}$/.test(value);
}

async function limitedJson(request: Request, limit: number): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > limit) return { ok: false, response: json(request, { error: "request body is too large" }, { status: 413 }) };
  const raw = await request.text();
  if (raw.length > limit) return { ok: false, response: json(request, { error: "request body is too large" }, { status: 413 }) };
  try {
    return { ok: true, body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, response: json(request, { error: "request body must be JSON" }, { status: 400 }) };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = publicOrigin(request, env);
    const identity = env.IDENTITY.getByName("issuer");

    if (request.method === "GET" && (path === "/" || path === "/index.html")) return staticAsset(request, FRONTEND_HTML, "text/html");
    if (request.method === "GET" && path === "/app.css") return staticAsset(request, FRONTEND_CSS, "text/css");
    if (request.method === "GET" && path === "/app.js") return staticAsset(request, FRONTEND_JS, "text/javascript");

    // ── Ecosystem monitor ────────────────────────────────────────────────
    if (request.method === "GET" && path === "/monitor") return staticAsset(request, MONITOR_HTML, "text/html");
    if (request.method === "GET" && path === "/monitor.css") return staticAsset(request, MONITOR_CSS, "text/css");
    if (request.method === "GET" && path === "/monitor.js") return staticAsset(request, MONITOR_JS, "text/javascript");

    if (request.method === "GET" && path === "/api/monitor") {
      const monitor = env.MONITOR.getByName("ecosystem");
      const payload = await monitor.dashboard();
      // A deployment that has never scanned would otherwise show an empty page
      // until the next nightly cron. Start the first scan behind the response so
      // the visitor gets data on their next reload rather than a long wait now.
      if (!payload.lastRunAt) {
        ctx.waitUntil(monitor.runIfStale(origin, MIN_MANUAL_INTERVAL_MS).catch(() => undefined));
      }
      return json(request, payload);
    }

    if (request.method === "POST" && path === "/api/monitor/refresh") {
      // Started, never awaited. A full scan takes tens of seconds — it walks
      // the registry, the chain in paced batches, and a real issuance — which
      // is far longer than a request should be held open, and holding it open
      // is what made this route throw in production.
      const monitor = env.MONITOR.getByName("ecosystem");
      const last = await monitor.lastRunAt();
      const stale = last === undefined || Date.now() - last >= MIN_MANUAL_INTERVAL_MS;
      if (stale) ctx.waitUntil(monitor.run(origin).then(() => undefined).catch(() => undefined));
      return json(request, {
        started: stale,
        message: stale ? "掃描已開始，約半分鐘後重新整理即可看到結果" : "距離上次掃描還不到一小時，顯示的是既有資料",
      });
    }

    if (request.method === "GET" && (path === "/monitor/feed.json" || path === "/monitor/feed.xml")) {
      const events = await env.MONITOR.getByName("ecosystem").recentEvents(50);
      const isJSON = path.endsWith(".json");
      return respond(request, isJSON ? jsonFeed(origin, events) : atomFeed(origin, events), {
        headers: {
          "content-type": isJSON ? "application/feed+json; charset=utf-8" : "application/atom+xml; charset=utf-8",
          "cache-control": "public, max-age=600",
        },
      });
    }

    // ── OID4VCI issuer metadata ──────────────────────────────────────────
    if (request.method === "GET" && path === "/.well-known/openid-credential-issuer") {
      return json(request, issuerMetadata(origin, CARD_TYPES), { headers: { "cache-control": "public, max-age=300" } });
    }
    if (request.method === "GET" && path === "/.well-known/oauth-authorization-server") {
      return json(request, authorizationServerMetadata(origin), { headers: { "cache-control": "public, max-age=300" } });
    }
    if (request.method === "GET" && path === "/.well-known/jwt-vc-issuer") {
      const { didKey, publicJwk } = await identity.identity();
      return json(request, {
        issuer: issuerIdentifier(origin),
        did: didKey,
        jwks: { keys: [{ ...publicJwk, kid: `${didKey}#0`, use: "sig", alg: "ES256" }] },
      }, { headers: { "cache-control": "public, max-age=300" } });
    }
    if (request.method === "GET" && path === "/status/1") {
      const token = await identity.statusListJwt(`${origin}/status/1`);
      return respond(request, token, { headers: { "content-type": "application/jwt", "cache-control": "no-store" } });
    }

    // ── Public description ───────────────────────────────────────────────
    if (request.method === "GET" && path === "/api/issuer") {
      const { didKey, publicJwk } = await identity.identity();
      return json(request, {
        didKey,
        publicJwk,
        origin,
        credentialIssuer: issuerIdentifier(origin),
        metadataUrl: `${issuerIdentifier(origin)}/.well-known/openid-credential-issuer`,
        statusListUrl: `${origin}/status/1`,
        officialTrustRegistry: env.OFFICIAL_TRUST_REGISTRY_URL,
        issuedCount: await identity.issuedCount(),
      });
    }
    if (request.method === "GET" && path === "/api/catalog") {
      return json(request, { ...publicCatalog(), offerLifetimeMs: OFFER_TTL_MS }, { headers: { "cache-control": "public, max-age=60" } });
    }
    if (request.method === "GET" && path === "/api/trust-list") {
      const { didKey } = await identity.identity();
      const registry = env.OFFICIAL_TRUST_REGISTRY_URL;
      const [list, self] = await Promise.all([
        cachedOfficialTrustList(registry),
        officialTrustFor(didKey, registry),
      ]);
      return json(request, {
        ...list,
        self: {
          didKey,
          host: new URL(origin).hostname,
          onOfficialList: self.trusted,
          officialVerdict: self,
          acceptedBy: [
            { party: "本站的出示測試（同一頁）", accepts: true, why: "只信任自己的 did:key" },
            { party: "有備而來 DEBUG 建置", accepts: true, why: "以沙盒例外釘住本站 DID 與主機名稱；Release 建置不包含" },
            { party: "數位發展部數位憑證皮夾", accepts: false, why: "本站不在官方信任清單" },
            { party: "請出示皮夾（verifier.mashbean.net）", accepts: false, why: "政府卡以官方 DID API 為唯一信任來源，會 fail closed" },
          ],
        },
      });
    }

    // ── Issuance ─────────────────────────────────────────────────────────
    if (request.method === "POST" && path === "/api/offers") {
      const parsed = await limitedJson(request, MAX_JSON_BODY);
      if (!parsed.ok) return parsed.response;
      const body = parsed.body as { cardId?: unknown; personaId?: unknown; wallet?: unknown };
      const card = getCard(body.cardId);
      const persona = getPersona(body.personaId);
      const wallet = body.wallet ?? "bonds";
      if (!card || !persona || !isWalletFamily(wallet)) {
        return json(request, { error: "unknown card, persona or wallet" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const resultKey = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { codeSecret, expiresAt } = await env.ISSUANCES.getByName(id).init({ id, cardId: card.id, personaId: persona.id, wallet, resultKey });
      const offerUri = `${origin}/api/offer/${id}`;
      const qr = offerDeepLink(wallet, offerUri);
      return json(request, {
        id,
        resultKey,
        eventsUrl: `${origin.replace(/^http/, "ws")}/api/events/${id}`,
        offerUri,
        qr,
        qrSvg: qrSvg(qr),
        credentialOffer: {
          credential_issuer: issuerIdentifier(origin),
          credential_configuration_ids: [card.id],
          grants: { "urn:ietf:params:oauth:grant-type:pre-authorized_code": { "pre-authorized_code": `${id}.${codeSecret.slice(0, 6)}…` } },
        },
        expiresAt,
        card: { id: card.id, name: card.name, kind: card.kind, issuerDisplay: card.issuerDisplay },
        persona: { id: persona.id, name: persona.name },
        claims: claimsFor(card, persona),
      });
    }

    const offerMatch = path.match(/^\/api\/offer\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && offerMatch && validSessionId(offerMatch[1])) {
      const object = await env.ISSUANCES.getByName(offerMatch[1]).offerObject(origin);
      if (!object) return json(request, { error: "offer is unknown, redeemed or expired" }, { status: 404 });
      return respond(request, object, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }

    if (request.method === "POST" && path === "/token") {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
        return oauthError(request, 415, "invalid_request", "token request must be application/x-www-form-urlencoded");
      }
      const raw = await request.text();
      if (raw.length > MAX_JSON_BODY) return oauthError(request, 413, "invalid_request", "token request is too large");
      const parsed = parseTokenRequest(new URLSearchParams(raw));
      if (!parsed.ok) return oauthError(request, 400, parsed.error, parsed.description);
      const code = splitCompoundToken(parsed.code);
      if (!code) return oauthError(request, 400, "invalid_grant", "pre-authorized code is not one this issuer minted");
      const redeemed = await env.ISSUANCES.getByName(code.id).redeem({ secret: code.secret, clientId: parsed.clientId });
      if (!redeemed.ok) return oauthError(request, redeemed.status, redeemed.error, redeemed.description);
      if (parsed.configurationId && parsed.configurationId !== redeemed.cardId) {
        return oauthError(request, 400, "invalid_request", "authorization_details names a credential that was not offered");
      }
      return json(request, tokenResponse(compoundToken(code.id, redeemed.accessSecret), redeemed.cNonce, redeemed.cardId));
    }

    if (request.method === "POST" && path === "/credential") {
      const authorization = request.headers.get("authorization") ?? "";
      const bearer = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
      const token = splitCompoundToken(bearer);
      if (!token) return oauthError(request, 401, "invalid_token", "a Bearer access token from this issuer is required");
      const parsed = await limitedJson(request, MAX_CREDENTIAL_BODY);
      if (!parsed.ok) return parsed.response;
      const credentialRequest = parseCredentialRequest(parsed.body);
      if (!credentialRequest.ok) return oauthError(request, 400, credentialRequest.error, credentialRequest.description);
      const issued = await env.ISSUANCES.getByName(token.id).issue({
        secret: token.secret,
        proofJwt: credentialRequest.proofJwt,
        origin,
        credentialIdentifier: credentialRequest.credentialIdentifier,
      });
      if (!issued.ok) return oauthError(request, issued.status, issued.error, issued.description);
      return json(request, {
        credentials: [{ credential: issued.credential }],
        credential: issued.credential,
        c_nonce: issued.cNonce,
        c_nonce_expires_in: 600,
      });
    }

    const eventsMatch = path.match(/^\/api\/events\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && eventsMatch && validSessionId(eventsMatch[1])) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return respond(request, "expected websocket", { status: 426, headers: { "cache-control": "no-store" } });
      }
      return env.ISSUANCES.getByName(eventsMatch[1]).fetch(request);
    }

    // ── Presentation demo ────────────────────────────────────────────────
    if (request.method === "POST" && path === "/api/presentations") {
      const parsed = await limitedJson(request, MAX_JSON_BODY);
      if (!parsed.ok) return parsed.response;
      const body = parsed.body as { cardId?: unknown };
      const card = getCard(body.cardId);
      if (!card) return json(request, { error: "unknown card" }, { status: 400 });
      const id = crypto.randomUUID();
      const resultKey = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const responseUri = `${origin}/api/response/${id}`;
      const { didKey } = await identity.identity();
      await env.SESSIONS.getByName(id).init({ clientId: didKey, responseUri, resultKey, cardId: card.id });
      const requestUri = `${origin}/api/request/${id}`;
      const qr = `openid4vp://?client_id=${encodeURIComponent(didKey)}&request_uri=${encodeURIComponent(requestUri)}`;
      return json(request, {
        id,
        resultKey,
        eventsUrl: `${origin.replace(/^http/, "ws")}/api/presentation-events/${id}`,
        qr,
        qrSvg: qrSvg(qr),
        requestUri,
        responseUri,
        clientId: didKey,
        card: { id: card.id, name: card.name },
        requestedClaims: card.presentClaims.map((name) => ({ name, label: card.claims.find((claim) => claim.key === name)?.label ?? name })),
      });
    }

    const requestMatch = path.match(/^\/api\/request\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && requestMatch && validSessionId(requestMatch[1])) {
      const object = await env.SESSIONS.getByName(requestMatch[1]).requestObject();
      if (!object) return respond(request, "gone", { status: 404, headers: { "cache-control": "no-store" } });
      return respond(request, object, { headers: { "content-type": "application/oauth-authz-req+jwt", "cache-control": "no-store" } });
    }

    const responseMatch = path.match(/^\/api\/response\/([0-9a-f-]{36})$/);
    if (request.method === "POST" && responseMatch && validSessionId(responseMatch[1])) {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
        return json(request, { status: "failed", reason: "content type must be application/x-www-form-urlencoded" }, { status: 415 });
      }
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_PRESENTATION_BODY) return json(request, { status: "failed", reason: "presentation response is too large" }, { status: 413 });
      const body = await request.text();
      if (body.length > MAX_PRESENTATION_BODY) return json(request, { status: "failed", reason: "presentation response is too large" }, { status: 413 });
      const result = await env.SESSIONS.getByName(responseMatch[1]).submit(body);
      return json(request, result, { status: result.status === "failed" ? 400 : result.status === "gone" ? 404 : 200 });
    }

    const presentationEventsMatch = path.match(/^\/api\/presentation-events\/([0-9a-f-]{36})$/);
    if (request.method === "GET" && presentationEventsMatch && validSessionId(presentationEventsMatch[1])) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return respond(request, "expected websocket", { status: 426, headers: { "cache-control": "no-store" } });
      }
      return env.SESSIONS.getByName(presentationEventsMatch[1]).fetch(request);
    }

    return respond(request, "not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },

  /** The daily ecosystem scan. One a day: the registers it watches move slowly,
   *  and a monitor that hammers other people's infrastructure to look busy is a
   *  worse citizen than the thing it is watching. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const origin = env.ISSUER_ORIGIN?.trim().replace(/\/$/, "") || "https://issuer.mashbean.net";
    ctx.waitUntil(env.MONITOR.getByName("ecosystem").run(origin).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
