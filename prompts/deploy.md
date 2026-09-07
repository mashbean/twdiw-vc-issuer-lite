# TWDIW VC Issuer Lite 部署 prompt

把下列 prompt 交給能操作程式碼、GitHub 與 Cloudflare 的 coding agent。請先填入方括號中的資訊；不確定的項目可保留，讓 agent 在執行前詢問。

```text
請使用 https://github.com/mashbean/twdiw-vc-issuer-lite，替我建立一個 OID4VCI 測試發卡站。

目標
- 模式：[新建獨立發卡站／更新既有部署／新增卡種或虛構持卡人]
- 公開 HTTPS 網址：[例如 https://issuer.example.com]
- 要領卡的皮夾：[有備而來 DEBUG 建置／其他已釘住本站 DID 的皮夾]
- 卡種：[沿用六種預設／新增：____]

實作要求
1. 先讀取 repository 的 README、docs/protocol-and-trust.md、docs/test-data.md 與 skills/deploy-twdiw-vc-issuer-lite/SKILL.md。
2. 新部署使用 repository 根目錄的 wrangler.jsonc；不要複製 wrangler.mashbean.jsonc。
3. 使用 Cloudflare Workers 與三個 Durable Objects。設定 ISSUER_ORIGIN 為實際公開 HTTPS origin。
4. 既有部署更新時保留 Worker 名稱、Durable Object namespace 與 issuer did:key；不得為了改名重建 identity。
5. 只發行 src/catalog.ts 裡的虛構資料。卡種 id 必須含 sandbox；不要新增接受使用者輸入個資的表單，也不要接進真實資料來源。
6. 卡片不落地：IssuanceSession 在發卡完成或 10 分鐘後刪除；PresentationSession 在查驗完成或 10 分鐘後刪除。不得把卡片、presentation、揭露欄位寫入 Durable Object、KV、D1、R2、log 或 analytics。
7. 保留同頁的出示測試與信任清單區塊，並保持「本站不在官方信任清單」的誠實標示。
8. 不宣稱已通過 OpenID Foundation conformance certification；標示為 OID4VCI 預授權碼流程加 TWDIW 相容 profile。

驗收要求
- npm test
- npm run typecheck
- npm run cf-typegen
- npx wrangler deploy --dry-run
- 部署後 node scripts/smoke.mjs <公開網址> 全部步驟通過
- 確認 GET /、/api/catalog、/.well-known/openid-credential-issuer、/status/1 回傳 HTTP 200
- 回報新站的 did:key（GET /api/issuer）與主機名稱，供釘進皮夾的信任例外
- 將真實皮夾的跨裝置領卡與出示列成獨立實機驗收，不把 smoke test 當成完成證據

最後請回報已完成、尚未完成與實機驗收步驟。不要輸出任何 secret。

一鍵部署與數位發展部的官方發行者註冊是兩件事。官方數位憑證皮夾不會收下本站的卡；若需要正式註冊，請另外導向 https://www.wallet.gov.tw/apply/applyIssuerVerifier.html，不得宣稱本專案能代辦。
```
