---
name: deploy-twdiw-vc-issuer-lite
description: Deploy or extend mashbean/twdiw-vc-issuer-lite as a Cloudflare Workers OID4VCI test-card issuer for Taiwan Digital Identity Wallet dialect credentials. Use when standing up a new sandbox issuer, adding a card type or persona, pinning the issuer into a wallet's trust exception, or updating a deployment without losing its did:key.
---

# Deploy TWDIW VC Issuer Lite

Deploy or extend the sandbox issuer with explicit boundaries: fictional data only, a stable issuer identity, and honest trust labelling.

## Establish the mode

Determine which outcome is requested:

- New standalone Cloudflare deployment
- Update to an existing deployment
- A new card type or persona
- Pinning the issuer into a wallet build

Confirm the public HTTPS origin and which wallet will collect the cards. The only wallet that collects from an unregistered issuer today is a 有備而來 DEBUG build with the issuer pinned as a sandbox exception; the official 數位憑證皮夾 refuses issuers outside the 數位發展部 trust list, and so does the paired 請出示皮夾 verifier.

## Read project guidance

Read `README.md`, `docs/protocol-and-trust.md` and `docs/test-data.md` before editing. Use the repository root `wrangler.jsonc` for new deployments. `wrangler.mashbean.jsonc` belongs only to the maintained demo at `issuer.mashbean.net`.

For current Cloudflare CLI syntax or platform limits, consult official Cloudflare Workers documentation rather than relying on remembered commands.

## Preserve issuer identity

The P-256 issuer key lives in the `IssuerIdentity` Durable Object. When updating an existing service, preserve its Worker name and Durable Object namespace. A renamed or newly provisioned namespace produces a different `did:key`; every wallet that pinned the old DID stops accepting new cards, and cards already issued still verify against the old DID only.

Never place private keys in source, configuration, logs, or browser responses. `GET /api/issuer` publishes the DID and public JWK; that is the value to pin.

## Keep the data fictional

`src/catalog.ts` is the only data source. Card type ids must contain `sandbox`; personas must stay invented (placeholder names, generated national id check digits, `09000001xx` phones, `@sandbox.example` mail, 沙盒 organisations). Do not add a form that accepts user-typed personal data to the demo, and do not connect a real data source without redoing the privacy design in `docs/protocol-and-trust.md`.

When adding a card type, choose claim keys the wallet already labels (see `docs/test-data.md`), keep `presentClaims` a strict subset of `claims`, and add the wallet-side label and card-kind mapping if a key is new.

## Pin the issuer into a wallet

For 有備而來, add a DEBUG-only `TWDIWIssuer` entry with the deployment's `did:key` and `issuerMetadataBaseURL` (the public origin), append it beside `.sandboxDemo` in `CredentialCollection` and map it to `.developmentSandbox`, and let `OID4VPPresentation.verifierHosts` derive the response host from it. Keep it out of Release builds. State plainly that this is a trust exception the wallet operator owns.

## Validate before reporting completion

Run:

```bash
npm test
npm run typecheck
npm run cf-typegen
npx wrangler deploy --dry-run
```

After an authorized deployment, run the live smoke test, which plays the wallet end to end and presents the card back:

```bash
node scripts/smoke.mjs https://your-issuer.example
```

Confirm `GET /`, `GET /api/catalog`, `GET /.well-known/openid-credential-issuer` and `GET /status/1` return HTTP 200, and that `credential_endpoint` shares the issuer's host.

Report fixture tests, the smoke test and real-wallet acceptance separately. A passing smoke test proves the endpoints speak the wallet's dialect; it does not prove a real wallet on a phone collected and presented the card.

## Handoff

Report:

- Completed implementation and deployment state
- Public origin, repository revision, and the issuer `did:key`
- Whether the issuer identity was preserved
- Card types and personas available
- Which wallet builds have the issuer pinned
- Remaining real-device cases

State clearly that deployment is not official issuer registration and that the official wallet will not collect these cards. Organizations seeking official status must use https://www.wallet.gov.tw/apply/applyIssuerVerifier.html; this repository is independent of that process.
