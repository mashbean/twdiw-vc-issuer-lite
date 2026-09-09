export const FRONTEND_HTML = /* html */ `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="用虛構測試資料練習數位皮夾發卡、領卡與出示的一鍵部署 OID4VCI 發行服務">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="請收下卡片">
  <meta property="og:title" content="請收下卡片｜輕量化發行證件，支援數位皮夾">
  <meta property="og:description" content="支援有備而來數位皮夾的測試發卡站，讓你可以一鍵建立自己的發卡服務。">
  <meta property="og:url" content="https://issuer.mashbean.net/">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="請收下卡片｜輕量化發行證件，支援數位皮夾">
  <meta name="twitter:description" content="支援有備而來數位皮夾的測試發卡站，讓你可以一鍵建立自己的發卡服務。">
  <title>請收下卡片｜輕量化數位皮夾發卡</title>
  <link rel="stylesheet" href="/app.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/" aria-label="請收下卡片首頁">
      <span class="brand-mark" aria-hidden="true">＋</span>
      <span>請收下卡片</span>
    </a>
    <nav class="site-nav" aria-label="主要導覽">
      <a href="#collect">立即領卡</a>
      <a href="#present">出示測試</a>
      <a href="#trust">信任清單</a>
      <a href="/monitor">監測儀表板</a>
      <a href="#developers">免費部署</a>
      <a href="https://github.com/mashbean/twdiw-vc-issuer-lite">GitHub</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <p class="eyebrow">OPEN-SOURCE OID4VCI ISSUER</p>
      <h1>請收下卡片</h1>
      <p class="lede hero-subtitle">輕量化發行證件，支援數位皮夾</p>
      <p class="hero-supporting">用一批虛構的測試資料，把「發卡 → 領卡 → 出示 → 查驗」整條流程在一頁裡走完，也讓你可以一鍵建立自己的發卡服務</p>
      <div class="hero-actions">
        <a class="cta primary-link" href="#collect">我是民眾，領一張測試卡</a>
        <a class="cta secondary-link" href="#developers">我想建立發卡服務</a>
      </div>
      <ul class="proof-points" aria-label="服務特點">
        <li>OID4VCI 預授權碼流程</li>
        <li>TWDIW 方言 SD-JWT</li>
        <li>Cloudflare 一鍵部署</li>
        <li>GPL-3.0 開源</li>
      </ul>
    </section>

    <aside class="experiment-notice" aria-labelledby="experiment-notice-title">
      <div class="experiment-mark" aria-hidden="true">測試資料</div>
      <div>
        <h2 id="experiment-notice-title">虛構資料實驗站</h2>
        <p>本站發出的每一張卡片都是虛構資料：姓名是表單範例常用的名字，統一編號只是檢查碼正確的亂數，機構都是不存在的「沙盒」單位。本站不是數位發展部或任何機關的官方發行者，也不在官方信任清單上；卡片只能用來測試皮夾與查驗流程，不能證明任何真實身分。本站由 mashbean 依<a href="https://github.com/moda-gov-tw/TWDIW-official-app">數位憑證皮夾原始碼</a>與文件獨立建置。</p>
      </div>
    </aside>

    <section class="audiences" aria-label="使用方式">
      <article class="audience-card citizen-card">
        <p class="card-kicker">給皮夾使用者</p>
        <h2>領一張測試卡，再出示回來</h2>
        <p>選一種常見卡片、選一位虛構持卡人，用有備而來掃描 QR Code 收下卡片。接著在同一頁把卡片出示回來，看見簽章、持有人綁定與選擇性揭露怎麼運作。</p>
        <a href="#collect">前往領卡 <span aria-hidden="true">→</span></a>
      </article>
      <article class="audience-card business-card">
        <p class="card-kicker">給服務提供者</p>
        <h2>用自己的網域建立發卡服務</h2>
        <p>從 Cloudflare 免費方案開始，部署獨立的 OID4VCI issuer：持久的 did:key、預授權碼流程、狀態清單，以及能直接驗回自己卡片的出示端點。</p>
        <a href="#developers">查看部署與整合方式 <span aria-hidden="true">→</span></a>
      </article>
    </section>

    <section id="collect" class="try-section" aria-labelledby="collect-title">
      <div class="intro-heading">
        <p class="eyebrow">COLLECT A TEST CARD</p>
        <h2 id="collect-title">建立一次領卡</h2>
        <p>每張卡片先列出會寫進去的欄位。皮夾收到後，欄位會以選擇性揭露的形式保存，出示時可以逐欄決定給不給。</p>
      </div>

      <div class="builder" aria-labelledby="collect-title">
        <div class="section-heading">
          <span class="step">1</span>
          <div><h3>選擇要領卡的皮夾</h3><p>本站不在官方信任清單，所以只有開發測試版的有備而來會收下這裡的卡片。</p></div>
        </div>
        <div class="wallet-picker">
          <button id="wallet-bonds" class="wallet-choice" type="button" aria-pressed="true"><strong>有備而來</strong><small>開發測試建置 · 預設 · 已釘住本站 did:key</small></button>
          <button id="wallet-twdiw" class="wallet-choice" type="button" aria-pressed="false"><strong>數位憑證皮夾</strong><small>官方版本 · 預期會拒絕未註冊的發行者</small></button>
        </div>
        <p id="wallet-note" class="wallet-note"></p>

        <div class="section-heading profile-heading">
          <span class="step">2</span>
          <div><h3>選擇卡片種類</h3><p>六種日常會遇到的卡片。欄位名稱盡量對齊皮夾已知的欄位表，卡面才會用中文顯示。</p></div>
        </div>
        <div id="cards" class="profile-grid" aria-live="polite"></div>

        <div class="section-heading source-heading">
          <span class="step">3</span>
          <div><h3>選擇一位虛構持卡人</h3><p>六位不存在的人。任何人都可以領任何一位的卡片；這裡沒有真實身分驗證。</p></div>
        </div>
        <div id="personas" class="source-grid persona-grid"></div>

        <aside id="preview" class="disclosure" aria-live="polite"></aside>
        <button id="create" class="primary" type="button">建立一次性領卡 QR Code</button>
        <p id="create-error" class="error" role="alert"></p>
      </div>
    </section>

    <section id="offer" class="presentation hidden" aria-labelledby="offer-title">
      <div class="section-heading compact">
        <span class="step">4</span>
        <div><h2 id="offer-title">請用皮夾掃描</h2><p>領卡連結 10 分鐘後自動作廢；預授權碼只能用一次。</p></div>
      </div>
      <div class="qr-shell"><div id="qr" class="qr" aria-label="OID4VCI 領卡 QR Code"></div></div>
      <a id="deep-link" class="secondary" href="#">在這支手機直接開啟皮夾</a>
      <p id="deep-link-note" class="deep-link-note"></p>
      <p id="waiting" class="waiting"><span aria-hidden="true"></span><span id="waiting-text">等待皮夾讀取領卡連結</span></p>
      <details class="offer-details"><summary>這個 QR Code 裡有什麼</summary><pre id="offer-json"></pre></details>
      <button id="cancel" class="text-button" type="button">取消這次領卡</button>
    </section>

    <section id="issued" class="result hidden" aria-live="polite"></section>

    <section id="present" class="try-section present-section" aria-labelledby="present-title">
      <div class="intro-heading">
        <p class="eyebrow">PRESENT IT BACK</p>
        <h2 id="present-title">把卡片出示回來</h2>
        <p>本站同時是一個只信任自己的查驗端：它用同一把 did:key 簽署查驗請求，收到出示後驗證發卡簽章、持有人金鑰綁定、nonce、audience 與狀態清單。這證明卡片是完整的，不代表其他人應該接受它。</p>
      </div>
      <div class="builder">
        <div class="section-heading">
          <span class="step">1</span>
          <div><h3>選擇要出示的卡片種類</h3><p>每種卡片只要求其中幾個欄位，皮夾會逐欄詢問是否揭露。</p></div>
        </div>
        <div id="present-cards" class="profile-grid"></div>
        <aside id="present-claims" class="disclosure" aria-live="polite"></aside>
        <button id="present-create" class="primary" type="button">建立一次性出示 QR Code</button>
        <p id="present-error" class="error" role="alert"></p>
      </div>
      <section id="presentation" class="presentation hidden" aria-labelledby="presentation-title">
        <div class="section-heading compact">
          <span class="step">2</span>
          <div><h2 id="presentation-title">請用有備而來掃描</h2><p>使用 → 出示證件 → 掃描。查驗請求 10 分鐘後自動刪除。</p></div>
        </div>
        <div class="qr-shell"><div id="present-qr" class="qr" aria-label="OIDC4VP 查驗 QR Code"></div></div>
        <p class="deep-link-note">有備而來請從 App 內掃描上方 QR Code。若 QR 顯示在同一支手機，請改在另一個螢幕建立出示。</p>
        <p id="present-waiting" class="waiting"><span aria-hidden="true"></span>等待持卡人同意並出示</p>
        <button id="present-cancel" class="text-button" type="button">取消這次出示</button>
      </section>
      <section id="present-result" class="result hidden" aria-live="polite"></section>
    </section>

    <section id="trust" class="trust-section" aria-labelledby="trust-title">
      <div class="intro-heading">
        <p class="eyebrow">TRUST LIST</p>
        <h2 id="trust-title">誰在官方信任清單上，本站又在哪裡</h2>
        <p>皮夾與查驗端都以數位發展部的 DID 清單決定「這張卡是誰發的、要不要收」。下表即時讀取官方 API；本站的 did:key 列在最上方，並誠實標示它不在清單上、又被誰接受。</p>
      </div>
      <details class="trust-panel" id="trust-panel">
        <summary>展開信任清單與本站的自評</summary>
        <div id="self-entry" class="self-entry" aria-live="polite"></div>
        <div id="accepted-by" class="accepted-by"></div>
        <div class="trust-table-wrap">
          <table id="trust-table" class="trust-table">
            <thead><tr><th>機構</th><th>登記端點</th><th>DID</th><th>鏈上紀錄</th></tr></thead>
            <tbody><tr><td colspan="4" class="trust-loading">正在讀取官方信任清單…</td></tr></tbody>
          </table>
        </div>
        <p id="trust-meta" class="trust-meta"></p>
      </details>
    </section>

    <section class="trust-strip" aria-label="發卡範圍">
      <div><strong>發出去的東西</strong><span>ES256 簽章的 TWDIW 方言 SD-JWT、每欄一個 disclosure、cnf 綁定皮夾金鑰、StatusList2021 狀態清單</span></div>
      <div><strong>資料保存</strong><span>Durable Object 只在 10 分鐘內暫存卡種、虛構持卡人、預授權碼與 nonce；發卡完成即刪除，卡片不落地</span></div>
      <div><strong>標準範圍</strong><span>OID4VCI 預授權碼流程與 TWDIW 相容 profile；出示端使用 Presentation Exchange 加 DCQL 相容層</span></div>
    </section>

    <section id="developers" class="implementation" aria-labelledby="implementation-title">
      <p class="eyebrow">FOR DEVELOPERS</p>
      <h2 id="implementation-title">部署一套，或接進你原本的服務</h2>
      <p class="developer-lede">公開 repo 包含 Cloudflare Worker、三個 Durable Objects、OID4VCI 端點、狀態清單、出示查驗端點、部署 skill 與可直接交給 coding agent 的 prompt。第一次啟動時會在自己的 Durable Object 產生 P-256 <code>did:key</code>。</p>

      <div class="developer-grid">
        <article class="developer-card featured">
          <p class="card-kicker">ONE-CLICK DEPLOY</p>
          <h3>建立獨立發卡站</h3>
          <p>按下後連接 GitHub、選 Cloudflare 帳號並開始部署。部署完成後開啟網址就能發測試卡；要讓皮夾收下，還需要把新站的 did:key 與主機名稱釘進皮夾的信任例外。</p>
          <a class="developer-action" href="https://deploy.workers.cloudflare.com/?url=https://github.com/mashbean/twdiw-vc-issuer-lite">Deploy to Cloudflare <span aria-hidden="true">↗</span></a>
        </article>
        <article class="developer-card">
          <p class="card-kicker">AGENT SKILL</p>
          <h3>交給開發代理部署</h3>
          <p>Skill 會先確認新部署或既有服務整合，再處理自訂網域、皮夾端的信任釘定、測試與真機驗收邊界。</p>
          <a href="https://github.com/mashbean/twdiw-vc-issuer-lite/tree/main/skills/deploy-twdiw-vc-issuer-lite">開啟部署 skill <span aria-hidden="true">↗</span></a>
        </article>
        <article class="developer-card">
          <p class="card-kicker">EMBED WITH API</p>
          <h3>接進既有網站或流程</h3>
          <p>讀取 <code>GET /api/catalog</code>，以 <code>POST /api/offers</code> 建立領卡 QR，再由一次性 WebSocket 得知皮夾何時收下。要換成自己的卡種與資料來源，改 <code>src/catalog.ts</code>。</p>
          <a href="https://github.com/mashbean/twdiw-vc-issuer-lite/blob/main/docs/protocol-and-trust.md">閱讀協定與信任說明 <span aria-hidden="true">↗</span></a>
        </article>
        <article class="developer-card">
          <p class="card-kicker">PAIRED VERIFIER</p>
          <h3>搭配「請出示皮夾」</h3>
          <p>同一組人維護的開源查驗端。它對政府卡只信任官方 DID API，所以會拒絕本站的測試卡；這是設計，不是缺陷。要驗自己的卡，請 fork 後明確加入信任政策。</p>
          <a href="https://verifier.mashbean.net">開啟請出示皮夾 <span aria-hidden="true">↗</span></a>
        </article>
      </div>

      <aside class="official-registration" aria-labelledby="official-registration-title">
        <div>
          <p class="card-kicker">OFFICIAL REGISTRATION</p>
          <h3 id="official-registration-title">成為官方註冊發行者</h3>
          <p>部署這套開源發卡站只會建立技術服務，不會取得官方發行者身分，官方數位憑證皮夾也不會收下它發的卡。若要正式加入數位憑證皮夾生態系，仍須另向數位發展部提出申請；本專案不代辦。</p>
        </div>
        <a href="https://www.wallet.gov.tw/apply/applyIssuerVerifier.html">前往官方申請流程 <span aria-hidden="true">↗</span></a>
      </aside>

      <div class="prompt-block">
        <div>
          <p class="card-kicker">COPYABLE PROMPT</p>
          <h3>直接交給 coding agent</h3>
        </div>
        <button id="copy-prompt" class="copy-button" type="button" data-default="複製 prompt">複製 prompt</button>
        <pre id="deploy-prompt">請使用 https://github.com/mashbean/twdiw-vc-issuer-lite，幫我把「請收下卡片」部署到 Cloudflare Workers。保留 Durable Object 內的 issuer did:key；只發行 src/catalog.ts 裡的虛構測試資料，不要接進任何真實個資來源。完成測試、typecheck、dry-run 與公開網址檢查後，回報新站的 did:key 與主機名稱，讓我釘進皮夾的信任例外；真實皮夾的跨裝置領卡與出示列為獨立驗收步驟。</pre>
        <a class="prompt-link" href="https://github.com/mashbean/twdiw-vc-issuer-lite/blob/main/prompts/deploy.md">開啟完整 prompt 與可填參數</a>
      </div>

      <details class="protocol-details">
        <summary>標準與台灣相容層</summary>
        <p>發卡端實作 OpenID for Verifiable Credential Issuance 的預授權碼流程（credential offer by reference、token、credential，proof 為 <code>openid4vci-proof+jwt</code>）。卡片格式採台灣 TWDIW 現行方言：SD-JWT 包在 W3C <code>vc</code> 內，發行者與持有人都用 <code>did:key</code>（jwk_jcs-pub）。出示端與請出示皮夾相同，同時送出 Presentation Exchange 與 DCQL。這不代表已通過 OpenID Foundation conformance certification。</p>
      </details>
    </section>

    <section id="questions" class="faq" aria-labelledby="faq-title">
      <div class="intro-heading">
        <p class="eyebrow">Q&amp;A</p>
        <h2 id="faq-title">開始前常見的問題</h2>
      </div>
      <div class="faq-list">
        <details>
          <summary>這些卡片可以拿去哪裡用？</summary>
          <p>只能用來測試。卡片上的人不存在，發卡機構也不存在。它們能讓你在皮夾裡看到卡面、練習出示與選擇性揭露，並在本頁的出示測試驗回來；任何真實服務都不應該接受它們。</p>
        </details>
        <details>
          <summary>為什麼官方數位憑證皮夾收不下？</summary>
          <p>官方皮夾與請出示皮夾都以數位發展部的 DID 信任清單決定發行者可不可信，本站刻意不在清單上。有備而來的開發測試建置以一條明確的沙盒例外釘住本站的 did:key 與主機名稱，Release 建置不包含這條例外。</p>
        </details>
        <details>
          <summary>領卡資料會被保存嗎？</summary>
          <p>不保存卡片。Durable Object 只在 10 分鐘內暫存這次領卡選了哪張卡、哪位虛構持卡人、預授權碼與 nonce；皮夾收下後立即刪除。發出去的卡片只存在皮夾裡，以及建立領卡的那個瀏覽器分頁。</p>
        </details>
        <details>
          <summary>我可以把自己的資料放進卡片嗎？</summary>
          <p>示範站不接受輸入。自行部署時可以改 <code>src/catalog.ts</code> 換成自己的卡種與資料來源；一旦接進真實個資，就要另外處理告知、合法事由、保存期限與撤銷，不在示範站的範圍內。</p>
        </details>
        <details>
          <summary>卡片會過期或被撤銷嗎？</summary>
          <p>每種卡片有自己的效期，寫在 <code>exp</code> 與 <code>expiry_date</code>。每張卡都佔用 StatusList2021 狀態清單的一個位置，查驗端會讀取 <code>/status/1</code>；目前示範站沒有撤銷操作介面，所有位置都是有效。</p>
        </details>
        <details>
          <summary>這是數位發展部的官方服務嗎？</summary>
          <p>不是。這是獨立維護的開源實作，用於研究、測試與快速建立發卡服務，與數位發展部及各發卡機關沒有隸屬關係。</p>
        </details>
      </div>
    </section>

    <section class="resources" aria-labelledby="resources-title">
      <div>
        <p class="eyebrow">ECOSYSTEM</p>
        <h2 id="resources-title">相關服務與技術資料</h2>
      </div>
      <div class="resource-links">
        <a href="https://verifier.mashbean.net"><strong>請出示皮夾</strong><span>verifier.mashbean.net · 開源查驗端</span></a>
        <a href="https://bonds.tw"><strong>有備而來</strong><span>bonds.tw</span></a>
        <a href="https://wallet.gov.tw/"><strong>數位憑證皮夾</strong><span>官方網站</span></a>
        <a href="https://github.com/moda-gov-tw/TWDIW-official-app"><strong>TWDIW official app</strong><span>官方原始碼</span></a>
        <a href="https://www.wallet.gov.tw/apply/applyIssuerVerifier.html"><strong>官方發行者／驗證者申請</strong><span>正式介接流程</span></a>
        <a href="https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html"><strong>OpenID4VCI 1.0</strong><span>標準規格</span></a>
        <a href="https://github.com/mashbean/twdiw-vc-issuer-lite"><strong>Issuer Lite</strong><span>原始碼與部署說明</span></a>
        <a href="https://github.com/mashbean/twdiw-vp-verifier-lite"><strong>Verifier Lite</strong><span>查驗端原始碼</span></a>
        <a href="/monitor"><strong>生態系監測</strong><span>/monitor · 信任清單、撤銷、鏈上與 API 每日變更</span></a>
      </div>
    </section>
  </main>

  <footer>
    <span>TWDIW VC Issuer Lite · GPL-3.0-only</span>
    <span>Maintained by <a href="https://github.com/mashbean">mashbean</a></span>
  </footer>
</body>
</html>`;

export const FRONTEND_CSS = /* css */ `
:root{color-scheme:light;--ink:#10241c;--ink-soft:#1d3a2e;--muted:#5c7067;--paper:#f5f7f2;--card:#fff;--line:#dbe5de;--green:#087451;--green-2:#d9f5e8;--blue:#315fe8;--blue-2:#e9eeff;--amber:#b66600;--red:#a82828;--shadow:0 24px 70px rgba(16,52,38,.1)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif}button,a{font:inherit}button{color:inherit}a{color:inherit;text-underline-offset:4px}.site-header{height:76px;display:flex;align-items:center;justify-content:space-between;max-width:1180px;margin:auto;padding:0 28px}.brand{display:flex;align-items:center;gap:11px;font-weight:850;text-decoration:none}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--ink);color:white}.site-nav{display:flex;align-items:center;gap:24px}.site-nav a{color:var(--muted);font-size:.92rem;text-decoration:none}.site-nav a:hover{color:var(--ink)}main{max-width:1180px;margin:auto;padding:76px 28px 120px}.hero{max-width:990px;padding:34px 0 68px}.eyebrow,.card-kicker{margin:0 0 12px;color:var(--green);font-size:.76rem;font-weight:850;letter-spacing:.14em}.hero h1{max-width:960px;margin:0;font-size:clamp(3rem,7.2vw,6rem);line-height:1.02;letter-spacing:-.06em}.lede{max-width:830px;margin:28px 0 0;color:var(--muted);font-size:clamp(1.15rem,2.3vw,1.55rem);line-height:1.55}.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 22px;border-radius:15px;font-weight:780;text-decoration:none}.primary-link{background:var(--ink);color:white}.secondary-link{border:1px solid var(--ink);background:transparent}.proof-points{display:flex;flex-wrap:wrap;gap:10px 24px;margin:28px 0 0;padding:0;color:var(--muted);font-size:.9rem;list-style:none}.proof-points li::before{content:"✓";margin-right:7px;color:var(--green);font-weight:900}.audiences{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:100px}.audience-card{min-height:290px;padding:36px;border-radius:26px;border:1px solid var(--line);display:flex;flex-direction:column}.citizen-card{background:var(--card)}.business-card{background:var(--ink);color:white}.business-card .card-kicker{color:#7ce5ba}.business-card p:not(.card-kicker){color:#c7d6cf}.audience-card h2{max-width:420px;margin:4px 0 10px;font-size:clamp(1.65rem,3vw,2.35rem);line-height:1.2}.audience-card>p:not(.card-kicker){max-width:500px;margin:0;color:var(--muted)}.audience-card a{margin-top:auto;padding-top:28px;font-weight:780}.try-section{scroll-margin-top:24px}.intro-heading{max-width:760px;margin:0 0 30px}.intro-heading h2{margin:0;font-size:clamp(2.1rem,4.8vw,3.9rem);line-height:1.1;letter-spacing:-.04em}.intro-heading>p:last-child{margin:15px 0 0;color:var(--muted);font-size:1.05rem}.builder,.presentation,.result{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:clamp(24px,5vw,52px);box-shadow:var(--shadow)}.section-heading{display:flex;align-items:flex-start;gap:16px;margin-bottom:22px}.section-heading h2,.section-heading h3{margin:-5px 0 2px;font-size:1.55rem;line-height:1.35}.section-heading p{margin:0;color:var(--muted)}.section-heading.compact{margin-bottom:12px}.step{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:50%;background:var(--green-2);color:var(--green);font-weight:850}.profile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.profile,.source{appearance:none;border:1px solid var(--line);border-radius:16px;background:white;padding:18px;text-align:left;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s}.profile:hover,.source:hover{transform:translateY(-2px);border-color:#a7b8ad}.profile[aria-pressed=true],.source[aria-pressed=true]{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green);background:#fbfffd}.profile strong,.source strong{display:block;font-size:1.03rem}.profile small,.source small{display:block;margin-top:5px;color:var(--muted);line-height:1.45}.source-heading{margin-top:42px}.source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.disclosure{margin:28px 0 22px;padding:20px 22px;border-radius:18px;background:#f0f4f1}.disclosure h3{margin:0 0 8px;font-size:1rem}.claim-list{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.claim{padding:5px 10px;border-radius:999px;background:white;border:1px solid var(--line);font-size:.88rem}.disclosure p{margin:8px 0 0;color:var(--muted);font-size:.92rem}.primary,.secondary{display:flex;width:100%;min-height:54px;align-items:center;justify-content:center;border-radius:14px;font-weight:780;text-decoration:none}.primary{border:0;background:var(--ink);color:#fff;cursor:pointer}.primary:hover{background:var(--ink-soft)}.primary:disabled{opacity:.55;cursor:wait}.secondary{border:1px solid var(--ink);color:var(--ink);background:white}.error{color:var(--red);min-height:1.5em;margin:8px 0 0}.presentation,.result{margin-top:24px}.presentation{max-width:650px;margin-inline:auto;text-align:center}.presentation .section-heading{text-align:left}.qr-shell{max-width:430px;margin:22px auto;padding:20px;background:#fff;border:1px solid var(--line);border-radius:22px}.qr svg{display:block;width:100%;height:auto}.waiting{display:flex;align-items:center;justify-content:center;gap:9px;color:var(--muted)}.waiting>span:first-child{width:9px;height:9px;background:var(--green);border-radius:50%;animation:pulse 1.3s infinite}.text-button{border:0;background:transparent;color:var(--muted);text-decoration:underline;cursor:pointer}.result{max-width:760px;margin-inline:auto}.result-top{display:flex;align-items:center;gap:14px}.result-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;background:var(--green-2);color:var(--green);font-size:1.7rem;font-weight:900}.result.not-established .result-icon{background:#fff0d6;color:#8b5700}.result.failed .result-icon{background:#fae2e2;color:var(--red)}.result h2{margin:0;font-size:1.65rem}.result-summary{margin:4px 0 0;color:var(--muted)}.evidence{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:24px 0}.evidence-card{padding:15px;border:1px solid var(--line);border-radius:15px}.evidence-card strong{display:block}.evidence-card small{color:var(--muted);overflow-wrap:anywhere}.claims{width:100%;border-collapse:collapse;margin-top:18px}.claims th,.claims td{text-align:left;padding:12px 4px;border-bottom:1px solid var(--line);vertical-align:top}.claims th{color:var(--muted);font-weight:500;width:42%}.claims td.withheld{color:var(--amber)}.policy{margin-top:20px;padding:15px 17px;border-left:4px solid var(--green);background:#f0f4f1;color:var(--muted)}.again{margin-top:20px}.result-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.trust-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin:84px 0;background:var(--line);border:1px solid var(--line);border-radius:22px;overflow:hidden}.trust-strip div{display:flex;flex-direction:column;gap:5px;padding:24px;background:var(--card)}.trust-strip strong{font-size:.9rem}.trust-strip span{color:var(--muted);font-size:.87rem}.implementation{scroll-margin-top:24px;padding:clamp(30px,6vw,64px);border-radius:30px;background:var(--ink);color:white}.implementation>.eyebrow{color:#7ce5ba}.implementation>h2{max-width:780px;margin:0;font-size:clamp(2.25rem,5.5vw,4.5rem);line-height:1.05;letter-spacing:-.045em}.developer-lede{max-width:820px;margin:22px 0 34px;color:#c7d6cf;font-size:1.05rem}.implementation code{color:#b5f1d8}.developer-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.developer-card{display:flex;flex-direction:column;min-height:300px;padding:25px;border:1px solid #395246;border-radius:20px;background:#173026}.developer-card.featured{background:white;color:var(--ink)}.developer-card.featured p:not(.card-kicker){color:var(--muted)}.developer-card h3{margin:2px 0 9px;font-size:1.4rem;line-height:1.25}.developer-card>p:not(.card-kicker){margin:0;color:#c7d6cf}.developer-card>a{margin-top:auto;padding-top:24px;color:#b5f1d8;font-weight:780}.developer-card.featured>a{color:var(--green)}.prompt-block{display:grid;grid-template-columns:1fr auto;gap:18px;margin-top:16px;padding:28px;border:1px solid #395246;border-radius:20px;background:#0c1d16}.prompt-block h3{margin:0;font-size:1.4rem}.prompt-block pre{grid-column:1/-1;max-height:230px;margin:0;padding:18px;border-radius:14px;background:#07130e;color:#d7e8df;white-space:pre-wrap;overflow:auto;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}.copy-button{align-self:start;border:1px solid #61776d;border-radius:10px;background:transparent;color:white;padding:9px 13px;cursor:pointer}.copy-button:hover{background:#173026}.prompt-link{grid-column:1/-1;color:#b5f1d8}.protocol-details{margin-top:20px;padding:19px 0;border-top:1px solid #395246;color:#c7d6cf}.protocol-details summary{cursor:pointer;color:white;font-weight:780}.faq{scroll-margin-top:24px;margin-top:100px}.faq-list{border-top:1px solid var(--line)}.faq details{border-bottom:1px solid var(--line);padding:0 4px}.faq summary{cursor:pointer;padding:22px 46px 22px 0;font-size:1.12rem;font-weight:780;list-style:none;position:relative}.faq summary::-webkit-details-marker{display:none}.faq summary::after{content:"+";position:absolute;right:4px;top:17px;color:var(--green);font-size:1.7rem;font-weight:400}.faq details[open] summary::after{content:"−"}.faq details p{max-width:850px;margin:-4px 0 24px;color:var(--muted)}.resources{display:grid;grid-template-columns:minmax(220px,.65fr) 1.35fr;gap:48px;margin-top:100px}.resources h2{margin:0;font-size:clamp(1.8rem,3.5vw,2.7rem);line-height:1.15}.resource-links{display:grid;grid-template-columns:1fr 1fr;gap:10px}.resource-links a{display:flex;flex-direction:column;padding:17px 19px;border:1px solid var(--line);border-radius:15px;background:var(--card);text-decoration:none}.resource-links a:hover{border-color:#9eb2a7}.resource-links span{color:var(--muted);font-size:.86rem}footer{max-width:1180px;margin:auto;padding:0 28px 54px;display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:.9rem}.hidden{display:none!important}@keyframes pulse{50%{opacity:.25;transform:scale(.7)}}
.hero .lede{color:var(--ink);font-size:clamp(1.35rem,2.8vw,2rem);font-weight:760;line-height:1.4}.hero-supporting{max-width:830px;margin:9px 0 0;color:var(--muted);font-size:1.05rem}.experiment-notice{display:grid;grid-template-columns:auto 1fr;gap:20px;margin:-20px 0 40px;padding:22px 24px;border:1px solid #d7b66e;border-radius:20px;background:#fff8e9}.experiment-mark{align-self:start;padding:5px 10px;border-radius:999px;background:#7b5000;color:white;font-size:.76rem;font-weight:850}.experiment-notice h2{margin:-4px 0 3px;font-size:1.18rem}.experiment-notice p{margin:0;color:#654f24}.experiment-notice a{font-weight:750}.deep-link-note{max-width:540px;margin:10px auto 0;color:var(--muted);font-size:.88rem;text-align:left}.wallet-picker{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wallet-choice{appearance:none;width:100%;border:1px solid var(--line);border-radius:16px;background:white;padding:18px;text-align:left;cursor:pointer}.wallet-choice strong,.wallet-choice small{display:block}.wallet-choice small{margin-top:5px;color:var(--muted)}.wallet-choice[aria-pressed=true]{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green);background:#fbfffd}.wallet-note{margin:12px 0 0;padding:12px 14px;border-left:4px solid var(--amber);background:#fff7ea;color:#6d4a13;font-size:.92rem}.wallet-note.calm{border-left-color:var(--green);background:#f0f4f1;color:var(--muted)}.profile-heading{margin-top:42px}.profile .kind{display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:var(--green-2);color:var(--green);font-size:.74rem;font-weight:800}.persona-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.persona-grid .source strong{font-size:1.15rem}.claims-preview{width:100%;border-collapse:collapse;margin-top:10px}.claims-preview th,.claims-preview td{text-align:left;padding:8px 4px;border-bottom:1px solid var(--line);vertical-align:top;font-size:.92rem}.claims-preview th{color:var(--muted);font-weight:500;width:38%}.offer-details{margin:18px auto 0;max-width:560px;text-align:left;color:var(--muted);font-size:.9rem}.offer-details summary{cursor:pointer}.offer-details pre{margin:10px 0 0;padding:14px;border-radius:12px;background:#f0f4f1;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}.present-section{margin-top:100px}.trust-section{scroll-margin-top:24px;margin-top:100px}.trust-panel{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:clamp(24px,5vw,44px);box-shadow:var(--shadow)}.trust-panel>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;font-size:1.15rem;font-weight:800}.trust-panel>summary::-webkit-details-marker{display:none}.trust-panel>summary::after{content:"展開 ▾";color:var(--muted);font-size:.85rem;font-weight:600;white-space:nowrap}.trust-panel[open]>summary::after{content:"收合 ▴"}.trust-panel[open]>summary{margin-bottom:22px;padding-bottom:20px;border-bottom:1px solid var(--line)}.self-entry{display:grid;grid-template-columns:auto 1fr;gap:18px;padding:20px 22px;border:1px solid #d7b66e;border-radius:18px;background:#fff8e9}.self-entry .badge{align-self:start;padding:5px 10px;border-radius:999px;background:#7b5000;color:white;font-size:.76rem;font-weight:850;white-space:nowrap}.self-entry.on-list{border-color:var(--green);background:#f0faf5}.self-entry.on-list .badge{background:var(--green)}.self-entry h3{margin:-2px 0 6px;font-size:1.15rem}.self-entry p{margin:4px 0 0;color:var(--muted);font-size:.92rem}.self-entry code{display:block;margin-top:8px;padding:10px 12px;border-radius:10px;background:white;border:1px solid var(--line);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;color:var(--ink)}.accepted-by{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0 24px}.accepted-by div{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border:1px solid var(--line);border-radius:14px}.accepted-by .mark{flex:0 0 26px;height:26px;display:grid;place-items:center;border-radius:50%;font-weight:900;font-size:.9rem}.accepted-by .mark.yes{background:var(--green-2);color:var(--green)}.accepted-by .mark.no{background:#fae2e2;color:var(--red)}.accepted-by strong{display:block;font-size:.95rem}.accepted-by small{color:var(--muted)}.trust-table-wrap{overflow-x:auto}.trust-table{width:100%;border-collapse:collapse;font-size:.92rem}.trust-table th,.trust-table td{text-align:left;padding:11px 8px;border-bottom:1px solid var(--line);vertical-align:top}.trust-table th{color:var(--muted);font-weight:600;white-space:nowrap}.trust-table td.did{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.trust-table small{display:block;color:var(--muted)}.trust-table .role{display:inline-block;margin:0 4px 4px 0;padding:1px 8px;border-radius:999px;background:var(--green-2);color:var(--green);font-size:.74rem;font-weight:800}.trust-table .role.verifier{background:var(--blue-2);color:var(--blue)}.trust-table tr.self-row{background:#fff8e9}.trust-loading{color:var(--muted);text-align:center;padding:30px!important}.trust-meta{margin:14px 0 0;color:var(--muted);font-size:.88rem}
.result.warning .result-icon{background:#fff0d6;color:#8b5700}.result.warning .policy{border-left-color:var(--amber)}.official-registration{display:grid;grid-template-columns:1fr auto;align-items:center;gap:28px;margin-top:16px;padding:28px;border:1px solid #6b8f7d;border-radius:20px;background:#132a20}.official-registration .card-kicker{margin-bottom:5px;color:#7ce5ba}.official-registration h3{margin:0;font-size:1.65rem}.official-registration p:not(.card-kicker){max-width:760px;margin:8px 0 0;color:#c7d6cf}.official-registration>a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 17px;border-radius:12px;background:#b5f1d8;color:#10241c;font-weight:800;text-decoration:none;white-space:nowrap}.primary:disabled{cursor:not-allowed}
@media(max-width:900px){.site-nav a:not(:last-child){display:none}.developer-grid,.trust-strip{grid-template-columns:1fr}.developer-card{min-height:0}.resources{grid-template-columns:1fr}.audiences{grid-template-columns:1fr}.audience-card{min-height:260px}.accepted-by{grid-template-columns:1fr}}
@media(max-width:760px){main{padding-top:34px}.profile-grid,.persona-grid{grid-template-columns:1fr 1fr}.source-grid{grid-template-columns:1fr}.builder,.presentation,.result,.trust-panel{border-radius:20px}.evidence{grid-template-columns:1fr}.resource-links{grid-template-columns:1fr}.implementation{border-radius:22px}.prompt-block,.official-registration{grid-template-columns:1fr}.official-registration>a{justify-self:start}.copy-button{justify-self:start}.hero{padding-top:22px}.experiment-notice,.self-entry{grid-template-columns:1fr}footer{flex-direction:column}.wallet-picker{grid-template-columns:1fr}.result-actions{grid-template-columns:1fr}}
@media(max-width:480px){.profile-grid,.persona-grid{grid-template-columns:1fr}.hero h1{font-size:3rem}.site-header{height:66px;padding-inline:18px}.brand{font-size:.88rem}.brand-mark{width:30px;height:30px}.site-nav{gap:0}.site-nav a{font-size:.86rem}main{padding-inline:18px}.builder,.trust-panel{padding:22px 18px}.audience-card{padding:27px}.hero-actions{flex-direction:column}.cta{width:100%}.proof-points{display:grid;gap:8px}.implementation{padding:28px 20px}.prompt-block{padding:20px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--ink:#edf6f1;--ink-soft:#d6e8df;--muted:#adbbb4;--paper:#0d1511;--card:#142019;--line:#304239;--green:#75ddb2;--green-2:#183c2d;--blue:#9db4ff;--blue-2:#1d2a4a;--shadow:none}.brand-mark,.primary,.primary-link{background:#edf6f1;color:#132019}.profile,.source,.secondary,.wallet-choice{background:#142019}.profile[aria-pressed=true],.source[aria-pressed=true],.wallet-choice[aria-pressed=true]{background:#192c23}.disclosure,.policy,.offer-details pre{background:#1b2b23}.claim{background:#25372e}.qr-shell{background:white}.business-card,.implementation{background:#08110d}.citizen-card,.resource-links a,.trust-strip div{background:#142019}.developer-card{background:#14271e}.developer-card.featured{background:#edf6f1;color:#132019}.secondary-link{border-color:#edf6f1}.prompt-block{background:#0a1711}.prompt-block pre{background:#050c09}.experiment-notice,.self-entry,.wallet-note,.trust-table tr.self-row{background:#2b2418;color:#e7c98f}.experiment-notice p,.self-entry p{color:#e7c98f}.self-entry code{background:#1b2b23;color:var(--ink)}.wallet-note.calm{background:#1b2b23;color:var(--muted)}.self-entry.on-list{background:#183c2d}}
`;

export const FRONTEND_JS = /* js */ `
const state={catalog:null,cards:[],personas:[],wallet:'bonds',cardId:null,personaId:null,presentCardId:null,socket:null,presentSocket:null,deepLink:null,offerLifetimeMs:600000,issuedTimer:null,presentTimer:null};
const $=(id)=>document.getElementById(id);
const params=new URLSearchParams(location.search);

function text(tag,value,className){const node=document.createElement(tag);if(className)node.className=className;node.textContent=value;return node}
function clear(node){while(node.firstChild)node.firstChild.remove()}
function card(){return state.cards.find((item)=>item.id===state.cardId)}
function persona(){return state.personas.find((item)=>item.id===state.personaId)}
function presentCard(){return state.cards.find((item)=>item.id===state.presentCardId)}
function labelFor(cardItem,key){const claim=(cardItem?cardItem.claims:[]).find((item)=>item.key===key);return claim?claim.label:key}
function releaseSocket(socket){socket.onopen=null;socket.onmessage=null;socket.onclose=null;socket.onerror=null;if(state.socket===socket)state.socket=null;if(state.presentSocket===socket)state.presentSocket=null}
function shortDid(did){return did.length>36?did.slice(0,20)+'…'+did.slice(-10):did}

function chooseWallet(wallet){state.wallet=wallet;syncURL();renderWallets()}
function renderWallets(){
  $('wallet-bonds').setAttribute('aria-pressed',String(state.wallet==='bonds'));
  $('wallet-twdiw').setAttribute('aria-pressed',String(state.wallet==='twdiw'));
  const note=$('wallet-note');const bonds=state.wallet==='bonds';
  note.className='wallet-note'+(bonds?' calm':'');
  note.textContent=bonds
    ?'QR 使用標準的 openid-credential-offer:// 連結。有備而來的開發測試建置已釘住本站的 did:key 與主機名稱，會通過兩道發行者信任閘門後收下卡片。'
    :'QR 改用官方皮夾專用的 modadigitalwallet://credential_offer 連結。官方皮夾以數位發展部信任清單決定發行者可不可信，本站不在清單上，預期會被拒絕；保留這個選項是為了讓你親眼看到拒絕的樣子。';
  const link=$('deep-link');const linkNote=$('deep-link-note');
  link.textContent=bonds?'在這支手機直接開啟有備而來':'在這支手機嘗試開啟數位憑證皮夾';
  linkNote.textContent=bonds
    ?'iPhone 上若同時安裝多個註冊 openid-credential-offer:// 的皮夾，系統不保證由哪一個接手；跨裝置時直接用有備而來「使用 → 領卡」掃描上方 QR Code 最穩。'
    :'這個按鈕使用官方數位憑證皮夾的專用入口。';
}

function renderCards(){
  const host=$('cards');clear(host);
  state.cards.forEach((item)=>{
    const button=text('button','','profile');button.type='button';button.setAttribute('aria-pressed',String(item.id===state.cardId));
    button.append(text('span',item.kind,'kind'),text('strong',item.name),text('small',item.description));
    button.onclick=()=>{state.cardId=item.id;syncURL();renderCards();renderPreview()};host.append(button);
  });
}
function renderPersonas(){
  const host=$('personas');clear(host);
  state.personas.forEach((item)=>{
    const button=text('button','','source');button.type='button';button.setAttribute('aria-pressed',String(item.id===state.personaId));
    button.append(text('strong',item.name),text('small',item.summary));
    button.onclick=()=>{state.personaId=item.id;syncURL();renderPersonas();renderPreview()};host.append(button);
  });
}
function claimsTable(cardItem,claims,className){
  const table=document.createElement('table');table.className=className||'claims-preview';
  Object.entries(claims).forEach(([key,value])=>{const row=document.createElement('tr');row.append(text('th',labelFor(cardItem,key)),text('td',String(value)));table.append(row)});
  return table;
}
function renderPreview(){
  const cardItem=card();const who=persona();const host=$('preview');clear(host);if(!cardItem||!who)return;
  host.append(text('h3','這張卡會寫進去的欄位（全部是虛構資料）'));
  host.append(claimsTable(cardItem,who.preview[cardItem.id]));
  host.append(text('p','發卡單位顯示為「'+cardItem.issuerDisplay+'」；卡片型別 '+cardItem.id+' 帶有 sandbox 字樣，皮夾會把它標為測試卡。'));
}
function renderAll(){renderWallets();renderCards();renderPersonas();renderPreview();renderPresentCards()}
function syncURL(){const url=new URL(location.href);url.searchParams.set('wallet',state.wallet);if(state.cardId)url.searchParams.set('card',state.cardId);if(state.personaId)url.searchParams.set('persona',state.personaId);history.replaceState(null,'',url)}

async function load(){
  const response=await fetch('/api/catalog',{headers:{accept:'application/json'}});if(!response.ok)throw new Error('無法載入卡片目錄');
  const body=await response.json();state.catalog=body;state.cards=body.cards;state.personas=body.personas;state.offerLifetimeMs=body.offerLifetimeMs||state.offerLifetimeMs;
  state.wallet=params.get('wallet')==='twdiw'?'twdiw':'bonds';
  state.cardId=(state.cards.find((item)=>item.id===params.get('card'))||state.cards[0]).id;
  state.personaId=(state.personas.find((item)=>item.id===params.get('persona'))||state.personas[0]).id;
  state.presentCardId=(state.cards.find((item)=>item.id===params.get('present'))||state.cards.find((item)=>item.id===state.cardId)).id;
  renderAll();
}

function clearIssued(){if(state.issuedTimer)clearTimeout(state.issuedTimer);state.issuedTimer=null;const host=$('issued');clear(host);host.className='result hidden'}
async function createOffer(){
  if(state.socket)state.socket.close();state.socket=null;clearIssued();$('create').disabled=true;$('create-error').textContent='';
  try{
    const response=await fetch('/api/offers',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({cardId:state.cardId,personaId:state.personaId,wallet:state.wallet})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'建立領卡失敗');
    state.deepLink=data.qr;$('qr').innerHTML=data.qrSvg;$('deep-link').href=data.qr;
    $('offer-json').textContent=data.qr+'\\n\\n→ GET '+data.offerUri+'\\n'+JSON.stringify(data.credentialOffer,null,2);
    $('waiting-text').textContent='等待皮夾讀取領卡連結';
    $('offer').classList.remove('hidden');renderWallets();
    $('offer').scrollIntoView({behavior:'smooth',block:'start'});
    openIssuanceChannel(data.eventsUrl,data.resultKey,data);
  }catch(error){$('create-error').textContent=error instanceof Error?error.message:'建立領卡失敗'}finally{$('create').disabled=false}
}
function openIssuanceChannel(url,key,offer){
  const socket=new WebSocket(url);state.socket=socket;let done=false;
  socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe',resultKey:key}));
  socket.onmessage=(event)=>{
    let data;try{data=JSON.parse(event.data)}catch{return}
    if(data.status==='ready')return;
    if(data.status==='progress'){
      $('waiting-text').textContent=data.step==='offer'?'皮夾已讀取領卡連結，正在檢查發行者信任':data.step==='token'?'皮夾已通過信任閘門並取得存取權杖（client_id='+(data.clientId||'?')+'），正在請求卡片':'皮夾正在領卡';
      return;
    }
    done=true;renderIssued(data,offer);releaseSocket(socket);
  };
  socket.onclose=()=>{if(!done&&!$('offer').classList.contains('hidden'))renderIssueFailure('一次性結果通道已中斷，請重新建立領卡')};
  socket.onerror=()=>{};
}
function evidenceCard(title,detail){const node=document.createElement('div');node.className='evidence-card';node.append(text('strong',title),text('small',detail));return node}
function renderIssued(data,offer){
  $('offer').classList.add('hidden');const host=$('issued');clear(host);
  if(data.status==='expired'){renderIssueFailure('領卡連結已過 10 分鐘作廢，請重新建立');return}
  if(data.status!=='issued'){renderIssueFailure(data.reason||'發卡未完成');return}
  host.className='result';
  const top=document.createElement('div');top.className='result-top';top.append(text('div','✓','result-icon'));
  const heading=document.createElement('div');heading.append(text('h2','皮夾已收下「'+(data.cardName||'')+'」'),text('p',(data.personaName||'')+' 的測試卡已簽發並交給皮夾。卡片不會留在伺服器上。','result-summary'));top.append(heading);host.append(top);
  const evidence=document.createElement('div');evidence.className='evidence';
  evidence.append(evidenceCard('發卡簽章','ES256，發行者 did:key（jwk_jcs-pub），型別 '+(data.credentialType||'')));
  evidence.append(evidenceCard('持有人綁定','cnf.jwk 等於皮夾在 proof JWT 中出示的金鑰；holder '+shortDid(data.holderDid||'')));
  evidence.append(evidenceCard('選擇性揭露',(data.disclosureCount||0)+' 個 disclosure，各自帶鹽與 SHA-256 摘要'));
  evidence.append(evidenceCard('狀態清單','StatusList2021，位置由發行者配置；查驗端會讀取 /status/1'));
  if(data.timingMs)evidence.append(evidenceCard('發卡耗時',data.timingMs.total+' ms（驗 proof '+data.timingMs.proof+' ms、鑄卡 '+data.timingMs.mint+' ms）'));
  if(data.jti)evidence.append(evidenceCard('卡片識別碼（jti）',data.jti));
  host.append(evidence);
  const cardItem=state.cards.find((item)=>item.id===data.cardId)||card();
  host.append(text('h3','卡片內容'));host.append(claimsTable(cardItem,data.claims||{},'claims'));
  host.append(text('p','接下來可以在皮夾首頁看到這張卡，也可以直接在下方把它出示回本站，驗證簽章、綁定與選擇性揭露。','policy'));
  const actions=document.createElement('div');actions.className='result-actions';
  const presentNow=text('button','接著出示這張卡','primary');presentNow.type='button';presentNow.onclick=()=>{state.presentCardId=data.cardId;renderPresentCards();$('present').scrollIntoView({behavior:'smooth',block:'start'})};
  const again=text('button','再領一張','secondary');again.type='button';again.onclick=()=>{clearIssued();$('collect').scrollIntoView({behavior:'smooth',block:'start'})};
  actions.append(presentNow,again);host.append(actions);
  host.append(text('p','這個結果會在 10 分鐘後自動從頁面清除。','result-retention'));
  state.issuedTimer=setTimeout(clearIssued,600000);
  host.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderIssueFailure(reason){
  $('offer').classList.add('hidden');const host=$('issued');clear(host);host.className='result failed';
  const top=document.createElement('div');top.className='result-top';top.append(text('div','×','result-icon'));
  const heading=document.createElement('div');heading.append(text('h2','發卡未完成'),text('p',reason,'result-summary'));top.append(heading);host.append(top);
  const again=text('button','重新建立領卡','primary again');again.type='button';again.onclick=()=>{clearIssued();createOffer()};host.append(again);host.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPresentCards(){
  const host=$('present-cards');clear(host);
  state.cards.forEach((item)=>{
    const button=text('button','','profile');button.type='button';button.setAttribute('aria-pressed',String(item.id===state.presentCardId));
    button.append(text('span',item.kind,'kind'),text('strong',item.name),text('small','要求：'+item.presentClaims.map((key)=>labelFor(item,key)).join('、')));
    button.onclick=()=>{state.presentCardId=item.id;renderPresentCards()};host.append(button);
  });
  const cardItem=presentCard();const claims=$('present-claims');clear(claims);if(!cardItem)return;
  claims.append(text('h3','這次會要求的欄位'));
  const list=document.createElement('div');list.className='claim-list';cardItem.presentClaims.forEach((key)=>list.append(text('span',labelFor(cardItem,key),'claim')));claims.append(list);
  claims.append(text('p','查驗端只信任本站自己的 did:key。它會拒絕政府卡與其他發行者的卡，因為它沒有任何其他信任來源。'));
}
function clearPresentResult(){if(state.presentTimer)clearTimeout(state.presentTimer);state.presentTimer=null;const host=$('present-result');clear(host);host.className='result hidden'}
async function createPresentation(){
  if(state.presentSocket)state.presentSocket.close();state.presentSocket=null;clearPresentResult();$('present-create').disabled=true;$('present-error').textContent='';
  try{
    const response=await fetch('/api/presentations',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({cardId:state.presentCardId})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'建立出示失敗');
    $('present-qr').innerHTML=data.qrSvg;$('presentation').classList.remove('hidden');
    $('presentation').scrollIntoView({behavior:'smooth',block:'start'});
    openPresentationChannel(data.eventsUrl,data.resultKey);
  }catch(error){$('present-error').textContent=error instanceof Error?error.message:'建立出示失敗'}finally{$('present-create').disabled=false}
}
function openPresentationChannel(url,key){
  const socket=new WebSocket(url);state.presentSocket=socket;let done=false;
  socket.onopen=()=>socket.send(JSON.stringify({type:'subscribe',resultKey:key}));
  socket.onmessage=(event)=>{let data;try{data=JSON.parse(event.data)}catch{return}if(data.status==='ready')return;done=true;renderPresentResult(data);releaseSocket(socket)};
  socket.onclose=()=>{if(!done&&!$('presentation').classList.contains('hidden'))renderPresentFailure('一次性結果通道已中斷，請重新建立出示')};
  socket.onerror=()=>{};
}
function statusDetail(data){
  if(data.credentialStatus==='valid')return '狀態清單確認為有效';
  return '狀態為 '+(data.credentialStatus||'unknown')+(data.credentialStatusReason?'（'+data.credentialStatusReason+'）':'');
}
function renderPresentResult(data){
  $('presentation').classList.add('hidden');const host=$('present-result');clear(host);
  if(data.status!=='verified'){renderPresentFailure(data.reason||'驗證未通過');return}
  const withheld=data.withheld||[];host.className='result'+(withheld.length?' warning':'');
  const top=document.createElement('div');top.className='result-top';top.append(text('div',withheld.length?'!':'✓','result-icon'));
  const heading=document.createElement('div');heading.append(text('h2',withheld.length?'密碼學驗證通過，但有欄位未揭露':'出示驗證通過'),text('p','「'+(data.cardName||'')+'」的簽章、持有人綁定、nonce 與 audience 都符合。'+(withheld.length?'持卡人選擇不揭露 '+withheld.length+' 個欄位。':''),'result-summary'));top.append(heading);host.append(top);
  const evidence=document.createElement('div');evidence.className='evidence';
  evidence.append(evidenceCard('簽章與持有人綁定','已驗證 nonce、audience、發卡簽章與 cnf ↔ 出示金鑰'));
  evidence.append(evidenceCard('發行者信任',data.issuerIsThisSite?'本站自己的 did:key（唯一信任來源）':'不是本站的 did:key'));
  evidence.append(evidenceCard('憑證狀態',statusDetail(data)));
  if(data.timingMs)evidence.append(evidenceCard('查驗耗時',data.timingMs.total+' ms（憑證與狀態 '+data.timingMs.credential+' ms）'));
  host.append(evidence);
  const cardItem=state.cards.find((item)=>item.id===data.cardId);
  const table=document.createElement('table');table.className='claims';
  (data.requestedClaims||[]).forEach((item)=>{const row=document.createElement('tr');const value=data.claims&&data.claims[item.name];const cell=text('td',value===undefined?'未揭露':String(value));if(value===undefined)cell.className='withheld';row.append(text('th',labelFor(cardItem,item.name)||item.label),cell);table.append(row)});
  host.append(table);
  host.append(text('p','這只證明卡片是本站簽發且綁定在出示的皮夾金鑰上。請出示皮夾與官方皮夾會因為本站不在官方信任清單而拒絕同一張卡；請看下方的信任清單。','policy'));
  host.append(text('p','結果會在 2 分鐘後自動從這個頁面清除。','result-retention'));
  const clearNow=text('button','立即清除出示結果','primary again');clearNow.type='button';clearNow.onclick=()=>{clearPresentResult()};host.append(clearNow);
  state.presentTimer=setTimeout(clearPresentResult,120000);
  host.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPresentFailure(reason){
  $('presentation').classList.add('hidden');const host=$('present-result');clear(host);host.className='result failed';
  const top=document.createElement('div');top.className='result-top';top.append(text('div','×','result-icon'));
  const heading=document.createElement('div');heading.append(text('h2','驗證未通過'),text('p',reason,'result-summary'));top.append(heading);host.append(top);
  const again=text('button','重新建立出示','primary again');again.type='button';again.onclick=()=>{clearPresentResult();createPresentation()};host.append(again);state.presentTimer=setTimeout(clearPresentResult,120000);host.scrollIntoView({behavior:'smooth',block:'start'});
}

function didCell(did){const cell=document.createElement('td');cell.className='did';cell.title=did;cell.textContent=shortDid(did);return cell}
async function loadTrust(){
  const body=$('trust-table').tBodies[0];
  try{
    const response=await fetch('/api/trust-list',{headers:{accept:'application/json'}});const data=await response.json();if(!response.ok)throw new Error(data.error||'無法讀取');
    const self=$('self-entry');clear(self);self.className='self-entry'+(data.self.onOfficialList?' on-list':'');
    self.append(text('span',data.self.onOfficialList?'在官方清單':'不在官方清單','badge'));
    const block=document.createElement('div');block.append(text('h3','本站 · '+data.self.host));
    block.append(text('p',data.self.onOfficialList?'官方 DID API 回傳了這筆啟用中的紀錄。':'官方 DID API 對本站 did:key 的回答：'+(data.self.officialVerdict.reason||'不在清單')+'。這是預期結果：本站是沙盒發行者。'));
    block.append(text('code',data.self.didKey));self.append(block);
    const accepted=$('accepted-by');clear(accepted);
    (data.self.acceptedBy||[]).forEach((item)=>{const node=document.createElement('div');node.append(text('span',item.accepts?'✓':'×','mark '+(item.accepts?'yes':'no')));const info=document.createElement('div');info.append(text('strong',item.party),text('small',item.why));node.append(info);accepted.append(node)});
    clear(body);
    const selfRow=document.createElement('tr');selfRow.className='self-row';
    const selfName=document.createElement('td');selfName.append(text('strong','請收下卡片（本站）'),text('small','沙盒發行者 · 不在官方清單'));
    const selfHosts=document.createElement('td');selfHosts.append(text('span','發行','role'),text('span','查驗','role verifier'),text('small',data.self.host));
    selfRow.append(selfName,selfHosts,didCell(data.self.didKey),text('td','—'));body.append(selfRow);
    data.entries.forEach((entry)=>{
      const row=document.createElement('tr');
      const name=document.createElement('td');name.append(text('strong',entry.name));if(entry.nameEnglish)name.append(text('small',entry.nameEnglish));if(entry.taxId)name.append(text('small','統編 '+entry.taxId));
      const hosts=document.createElement('td');if(entry.issuerMetadataBaseURL)hosts.append(text('span','發行端點','role'));if(entry.serviceBaseURL)hosts.append(text('span','服務端點','role verifier'));entry.hosts.forEach((host)=>hosts.append(text('small',host)));
      const chain=text('td',entry.onChain?'有':'無');if(entry.network)chain.append(text('small',entry.network));
      row.append(name,hosts,didCell(entry.did),chain);body.append(row);
    });
    $('trust-meta').textContent='官方清單共 '+data.entries.length+' 個 DID（去重後），來源 '+data.registry+'，讀取 '+data.pagesFetched+' 頁，時間 '+new Date(data.fetchedAt).toLocaleString('zh-Hant-TW')+(data.error?'；讀取中斷：'+data.error:'')+'。表中 DID 只顯示頭尾，滑鼠移上可見全文。';
  }catch(error){clear(body);const row=document.createElement('tr');row.append(text('td',error instanceof Error?error.message:'無法讀取官方信任清單','trust-loading'));row.firstChild.colSpan=4;body.append(row)}
}

$('wallet-bonds').onclick=()=>chooseWallet('bonds');$('wallet-twdiw').onclick=()=>chooseWallet('twdiw');
$('deep-link').onclick=(event)=>{event.preventDefault();if(state.deepLink)location.href=state.deepLink};
$('create').onclick=createOffer;$('cancel').onclick=()=>{if(state.socket)state.socket.close();state.socket=null;$('offer').classList.add('hidden');$('qr').replaceChildren();state.deepLink=null};
$('present-create').onclick=createPresentation;$('present-cancel').onclick=()=>{if(state.presentSocket)state.presentSocket.close();state.presentSocket=null;$('presentation').classList.add('hidden');$('present-qr').replaceChildren()};
$('copy-prompt').onclick=async()=>{const button=$('copy-prompt');try{await navigator.clipboard.writeText($('deploy-prompt').textContent);button.textContent='已複製';setTimeout(()=>{button.textContent=button.dataset.default},1800)}catch{button.textContent='請手動選取'}};
window.addEventListener('pagehide',()=>{if(state.socket)state.socket.close();if(state.presentSocket)state.presentSocket.close();state.socket=null;state.presentSocket=null;if(state.issuedTimer)clearTimeout(state.issuedTimer);if(state.presentTimer)clearTimeout(state.presentTimer)});
load().catch((error)=>{$('create-error').textContent=error instanceof Error?error.message:'載入失敗'});
loadTrust();
`;
