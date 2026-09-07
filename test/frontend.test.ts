import { describe, expect, it } from "vitest";
import { FRONTEND_CSS, FRONTEND_HTML, FRONTEND_JS } from "../src/frontend";

describe("landing page", () => {
  it("presents the collect, present and trust-list paths on one page", () => {
    expect(FRONTEND_HTML).toContain("請收下卡片");
    expect(FRONTEND_HTML).toContain("輕量化發行證件，支援數位皮夾");
    expect(FRONTEND_HTML).toContain('id="collect"');
    expect(FRONTEND_HTML).toContain('id="present"');
    expect(FRONTEND_HTML).toContain('id="trust"');
    expect(FRONTEND_HTML).toContain("我是民眾，領一張測試卡");
    expect(FRONTEND_HTML).toContain("我想建立發卡服務");
  });

  it("says plainly that the data is fictional and the site is not an official issuer", () => {
    expect(FRONTEND_HTML).toContain("虛構資料實驗站");
    expect(FRONTEND_HTML).toContain("不在官方信任清單");
    expect(FRONTEND_HTML).toContain("成為官方註冊發行者");
    expect(FRONTEND_HTML).toContain("不能證明任何真實身分");
  });

  it("defaults to 有備而來 and explains why the official wallet will refuse", () => {
    expect(FRONTEND_HTML).toContain('id="wallet-bonds" class="wallet-choice" type="button" aria-pressed="true"');
    expect(FRONTEND_JS).toContain("wallet:'bonds'");
    expect(FRONTEND_JS).toContain("預期會被拒絕");
    expect(FRONTEND_JS).toContain("openid-credential-offer://");
    expect(FRONTEND_JS).toContain("modadigitalwallet://credential_offer");
  });

  it("keeps the element ids the script drives", () => {
    for (const id of [
      "wallet-bonds", "wallet-twdiw", "wallet-note", "cards", "personas", "preview", "create", "create-error",
      "offer", "qr", "deep-link", "deep-link-note", "waiting", "waiting-text", "offer-json", "cancel", "issued",
      "present-cards", "present-claims", "present-create", "present-error", "presentation", "present-qr", "present-cancel", "present-result",
      "self-entry", "accepted-by", "trust-table", "trust-meta", "copy-prompt", "deploy-prompt",
    ]) {
      expect(FRONTEND_HTML, id).toContain(`id="${id}"`);
    }
  });

  it("receives one-time results over WebSocket without polling and clears them", () => {
    expect(FRONTEND_JS).toContain("new WebSocket(url)");
    expect(FRONTEND_JS).not.toContain("setInterval");
    expect(FRONTEND_JS).toContain("type:'subscribe',resultKey:key");
    expect(FRONTEND_JS).toContain("setTimeout(clearIssued,600000)");
    expect(FRONTEND_JS).toContain("setTimeout(clearPresentResult,120000)");
    expect(FRONTEND_JS).toContain("window.addEventListener('pagehide'");
  });

  it("reads the catalog and the trust list from same-origin APIs", () => {
    expect(FRONTEND_JS).toContain("fetch('/api/catalog'");
    expect(FRONTEND_JS).toContain("fetch('/api/offers'");
    expect(FRONTEND_JS).toContain("fetch('/api/presentations'");
    expect(FRONTEND_JS).toContain("fetch('/api/trust-list'");
    expect(FRONTEND_JS).not.toContain("http://");
  });

  it("links the repository, the paired verifier and the developer resources", () => {
    expect(FRONTEND_HTML).toContain("https://github.com/mashbean/twdiw-vc-issuer-lite");
    expect(FRONTEND_HTML).toContain("skills/deploy-twdiw-vc-issuer-lite");
    expect(FRONTEND_HTML).toContain("prompts/deploy.md");
    expect(FRONTEND_HTML).toContain("docs/protocol-and-trust.md");
    expect(FRONTEND_HTML).toContain("https://verifier.mashbean.net");
    expect(FRONTEND_HTML).toContain("Maintained by");
  });

  it("styles the additions the verifier page did not have", () => {
    for (const selector of [".persona-grid", ".claims-preview", ".trust-table", ".self-entry", ".accepted-by", ".wallet-note", ".offer-details"]) {
      expect(FRONTEND_CSS).toContain(selector);
    }
    expect(FRONTEND_CSS).toContain("prefers-color-scheme:dark");
  });

  it("does not leave any placeholder fix-ups behind", () => {
    expect(FRONTEND_HTML).not.toContain("原始碀");
    expect(FRONTEND_JS).not.toContain("密碩");
    expect(FRONTEND_JS).toContain("密碼學驗證通過");
  });
});
