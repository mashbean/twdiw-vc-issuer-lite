# 請收下卡片｜TWDIW VC Issuer Lite

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mashbean/twdiw-vc-issuer-lite)
[![CI](https://github.com/mashbean/twdiw-vc-issuer-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/mashbean/twdiw-vc-issuer-lite/actions/workflows/ci.yml)

輕量化發行證件，支援數位皮夾。這個專案把台灣數位憑證的**發卡端**縮成一個 Cloudflare Worker：按下部署按鈕後，Cloudflare 會建立 Worker、三個 Durable Object binding 與發卡者自己的 P-256 `did:key`，不需要另架資料庫或 Java 服務。它是[請出示皮夾](https://github.com/mashbean/twdiw-vp-verifier-lite)（查驗端）的姊妹專案，用同一套邏輯、目標與架構，把「驗證者」的建置成本降下來之後，再把「發行者」的建置成本降下來。

示範站：<https://issuer.mashbean.net>

同一個網頁上有三件事：

1. **領卡**：從六種常見卡片（駕照、門號、學生證、員工證、圖書借閱證、會員卡）與六位虛構持卡人裡各選一個，產生一次性的 OID4VCI 領卡 QR Code，由皮夾掃描收下。
2. **出示測試**：把剛領到的卡出示回本站。本站同時是一個只信任自己的 OIDC4VP 查驗端，會驗發卡簽章、持有人金鑰綁定、nonce、audience、選擇性揭露與狀態清單。
3. **信任清單**：即時讀取數位發展部的 DID 清單，把本站的 did:key 列在最上方，誠實標示它不在清單上、又被誰接受。

本站發出的每一張卡都是**虛構資料**（見 [docs/test-data.md](docs/test-data.md)）。它不是數位發展部或任何機關的官方發行者，也不在官方信任清單上；卡片只能用來測試皮夾與查驗流程。

## 誰收得下這裡的卡

| 對象 | 接受？ | 原因 |
|---|---|---|
| 本站的出示測試 | 是 | 只信任自己的 did:key |
| 「有備而來」DEBUG 建置 | 是 | 以沙盒例外釘住本站 DID 與主機名稱（`TWDIWIssuer.mashbeanSandbox`）；Release 建置不包含 |
| 數位發展部「數位憑證皮夾」 | 否 | 本站不在官方信任清單 |
| 請出示皮夾（verifier.mashbean.net） | 否 | 政府卡以官方 DID API 為唯一信任來源，fail closed |

皮夾以信任清單上的主機名稱決定要不要跟發卡端講話，再以清單上的 DID 決定要不要收下卡。要讓任何皮夾收下自己部署的卡，都要先把新站的 `did:key`（`GET /api/issuer`）與主機名稱釘進那個皮夾的信任例外。這是皮夾營運者擁有的決定；本專案不提供任何繞過官方清單的方法。

示範站的 did:key（2026-09-08，`jwk_jcs-pub` 拼法，公鑰內嵌；有備而來以 `TWDIWIssuer.mashbeanSandbox` 釘住同一字串）：

```text
did:key:z2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9Kbo2Mi4LUgEfFf1SyPGTHyP82LZ2VH9F6RGYsDNMtC2cmEJqADsXXbhTn4USsdTCP6h1ePhtazrv4rczSJUEKxyU1zRSHe5h4fjVg8VQRygF8YafgjNXEDzB6bquD9DUf45A
```

## 直接部署

1. 按 README 上方的 **Deploy to Cloudflare**。
2. 選擇 Cloudflare 帳號與新的 GitHub repository 名稱。
3. 等待 Workers Builds 完成。
4. 開啟新的 `workers.dev` 網址就能發測試卡；`GET /api/issuer` 會告訴你這個部署的 `did:key`。

Cloudflare 會依 `wrangler.jsonc` 自動建立 Durable Objects。第一次開啟時 `IssuerIdentity` 會在自己的 Durable Object 內產生 P-256 金鑰；私鑰不會出現在 repository、設定檔或任何回應。

若要使用自己的網域，把它加到 Worker 的 Custom Domains，再把 `ISSUER_ORIGIN` 設成完整 HTTPS origin。留空時會使用當前請求的 origin。

也可以把 [部署 skill](skills/deploy-twdiw-vc-issuer-lite/SKILL.md) 安裝給 coding agent，或直接使用 [部署 prompt](prompts/deploy.md)。

一鍵部署只建立獨立的開源發卡站，不會讓部署者成為數位發展部的註冊發行者，官方皮夾也不會收下它發的卡。正式申請須另走[數位憑證皮夾發行者／驗證者申請流程](https://www.wallet.gov.tw/apply/applyIssuerVerifier.html)；本專案與該註冊程序無關。

## 皮夾看到的流程

```text
QR   openid-credential-offer://?credential_offer_uri=https://issuer.example/api/offer/<id>
 1.  GET  /api/offer/<id>                              → credential_issuer, credential_configuration_ids, pre-authorized_code
 2.  GET  /.well-known/openid-credential-issuer        → credential_endpoint（同一主機）
 3.  POST /token        grant_type=…pre-authorized_code, pre-authorized_code, client_id=moda_dw
                                                        → access_token, c_nonce
 4.  POST /credential   Authorization: Bearer …, { credential_identifier, proofs: { jwt: [<openid4vci-proof+jwt>] } }
                                                        → { credential: "<jws>~<disclosure>~…~" }
```

發出去的卡是 TWDIW 現行方言：SD-JWT 包在 W3C `vc` 內，`iss` 與持有人都是 `did:key`（`jwk_jcs-pub`），`cnf.jwk` 綁定皮夾在 proof 中出示的金鑰，`vc.type[1]` 是卡種，每個欄位一個 disclosure，並附 StatusList2021 狀態清單（`GET /status/1`）。完整協定、信任模型與資料保存見 [docs/protocol-and-trust.md](docs/protocol-and-trust.md)。

## 生態系監測儀表板

`/monitor` 每天掃描一次台灣數位憑證皮夾生態系，並記錄**變化**：

| 面向 | 看什麼 |
|---|---|
| API 健康度 | 官方信任清單 API、申請目錄、查驗端、本站與 vct 中繼資料的可達性、延遲，以及回應形狀是否仍符合皮夾所依賴的欄位 |
| 發卡端到端自檢 | Worker 自己扮演皮夾走完 offer → token → proof → 領卡 → 驗證，證明發卡真的還能成功 |
| 信任清單 | 登記 DID 總數與角色分布，以及誰加入、離開、更名、換端點 |
| 撤銷清單 | 已知網址的清單位元圖、已撤銷張數，以及簽章金鑰是否就在發行者的 `did:key` 內 |
| 區塊鏈 | 不相信 API 的上鏈宣稱：抓它指名的 Arbitrum 交易比對內容，再查合約的**現況**紀錄，避免舊登錄被回放 |
| 原始碼 | 五個相關 repo 的最後更新、開放 issue 與授權（活躍度，不是健康度） |

變更會寫進時間軸，並以 [JSON Feed](https://issuer.mashbean.net/monitor/feed.json) 與 [Atom](https://issuer.mashbean.net/monitor/feed.xml) 發布，只推變化、不推「今天一切正常」。

儀表板明確標示它做不到的事：單點觀測、撤銷涵蓋範圍有限、看不到 TLS 憑證、資料最舊可能 24 小時。

兩個可選 secret：`GITHUB_TOKEN` 讓 repo 面板不受 GitHub 匿名配額影響（Cloudflare 共用 IP 常已用完），`ARBITRUM_RPC_URL` 指向帶金鑰的節點讓鏈上比對每天都能完整跑完（免費公用節點會限制 Cloudflare 出口流量）。兩者都不設也能運作，只是那兩格會標示查不到。

## API

建立一次領卡（頁面在做的事）：

```bash
curl -X POST https://your-worker.example/api/offers \
  -H 'content-type: application/json' \
  --data '{"cardId":"sandbox_student_card_v1","personaId":"lin-zhihao","wallet":"bonds"}'
```

回應包含：

- `qr`：皮夾要掃的 deep link；有備而來用 `openid-credential-offer://`，官方皮夾用 `modadigitalwallet://credential_offer`
- `qrSvg`：可直接嵌入頁面的 QR SVG
- `offerUri`：皮夾取得 offer object 的位置
- `eventsUrl`：同源一次性 WebSocket；瀏覽器連線後以第一個 message 提交 `resultKey`，之後會收到 `progress`（皮夾讀了 offer、拿到 token）與 `issued`（卡片內容、jti、耗時）
- `resultKey`：訂閱結果需要的 256-bit capability；不放進 URL、QR 或 offer

監測相關端點：`GET /api/monitor`（儀表板資料）、`POST /api/monitor/refresh`（一小時內至多一次，背景執行）、`GET /monitor/feed.json`、`GET /monitor/feed.xml`。

其他端點：`GET /api/catalog`（卡種與虛構持卡人）、`GET /api/issuer`（did:key、公鑰、狀態清單位置）、`GET /api/trust-list`（官方清單加本站自評）、`POST /api/presentations`／`GET /api/request/:id`／`POST /api/response/:id`（出示測試，與請出示皮夾同形）、`GET /.well-known/openid-credential-issuer`、`GET /.well-known/oauth-authorization-server`、`GET /.well-known/jwt-vc-issuer`、`GET /status/1`。

固定入口可以用 query string 建立，例如：

```text
https://your-worker.example/?wallet=bonds&card=sandbox_telecom_msisdn_v1&persona=chen-meiling
```

## 資料保存

Durable Object 只在 10 分鐘內暫存這次領卡選了哪張卡、哪位虛構持卡人、預授權碼與 nonce；皮夾收下卡後立即刪除。卡片本身不寫入伺服器；它存在皮夾裡，以及建立領卡的那個瀏覽器分頁（10 分鐘後自動清除）。出示測試的 presentation 與揭露值只在單次請求記憶體中處理，結果 2 分鐘後從頁面清除。網頁採同源 CSP，不載入第三方 script、字型或 analytics；`wrangler.jsonc` 預設停用 Workers Logs 持久化。

示範站不接受任何輸入的個資。自行部署若要接進真實資料，要重做告知、合法事由、保存期限與撤銷設計；那不在本專案範圍內。

## 本機開發

需要 Node.js 22 以上。

```bash
npm install
npm test
npm run typecheck
npm run dev
node scripts/smoke.mjs http://127.0.0.1:8787   # 扮演皮夾走完領卡與出示
```

Cloudflare 建置檢查：

```bash
npm run cf-typegen
npx wrangler deploy --dry-run
```

一般部署使用 repository 根目錄的通用 `wrangler.jsonc`。`wrangler.mashbean.jsonc` 只用來更新示範站，不應複製到自己的部署流程。

## 設定

| 變數 | 預設值 | 說明 |
|---|---|---|
| `ISSUER_ORIGIN` | 空白 | offer、metadata、狀態清單與出示 response_uri 的公開 HTTPS origin；空白時取目前 origin |
| `OFFICIAL_TRUST_REGISTRY_URL` | `https://frontend.wallet.gov.tw/api/did` | 信任清單頁讀取的官方 DID API；本站不用它決定任何事，只用它展示與自評 |

## 安全與隱私限制

- 預授權碼與存取權杖是 `<session id>.<secret>` 複合字串，secret 以常數時間比對；預授權碼只能兌換一次，存取權杖 10 分鐘內只能領一次卡。
- 皮夾 proof 必須是 `openid4vci-proof+jwt`、ES256、`aud` 為本站、`nonce` 等於本次 `c_nonce`、簽章對得上 `kid` 的 did:key 或 header `jwk`。
- 發卡者身分是單一部署的持久識別。更換 Durable Object namespace 會產生新的 `did:key`，既有皮夾釘定需重做。
- 出示測試只信任本站自己的 DID，拒絕政府卡與其他發行者的卡。
- 卡種 id 全帶 `sandbox`；有備而來的發行者對照表會把它們標成測試卡，不會冒充公路局或電信商。

弱點請依 [SECURITY.md](SECURITY.md) 私下回報。

## 相關連結

- [請出示皮夾](https://verifier.mashbean.net)（[原始碼](https://github.com/mashbean/twdiw-vp-verifier-lite)）
- [有備而來](https://bonds.tw)
- [數位發展部數位憑證皮夾](https://wallet.gov.tw/)
- [官方發行者／驗證者申請流程](https://www.wallet.gov.tw/apply/applyIssuerVerifier.html)
- [TWDIW official app 原始碼](https://github.com/moda-gov-tw/TWDIW-official-app)
- [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)

## 授權

本專案採 [GNU General Public License v3.0 only](LICENSE) 授權。專案名稱與介面不得解讀為數位發展部、任何發卡機關或電信業者的背書。

Maintained by [mashbean](https://github.com/mashbean).
