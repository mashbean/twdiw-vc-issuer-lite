# 協定與信任模型

## 一次領卡怎麼走

```text
Browser (this page)         Cloudflare Worker / DO                  Wallet
      | POST /api/offers            |                                   |
      |---------------------------->| 建 IssuanceSession：卡種、虛構持卡人、|
      |                             | 預授權碼 secret、resultKey、10 分鐘 alarm|
      | QR (deep link) + resultKey  |                                   |
      |<----------------------------|                                   |
      |                             |<--- scan / open deep link ---------|
      |                             |<--- GET /api/offer/:id ------------|  (1) offer object
      |                             |<--- GET /.well-known/openid-credential-issuer |  (2) credential_endpoint
      |                             |<--- POST /token  client_id=moda_dw |  (3) access_token + c_nonce
      |                             |<--- POST /credential  proofs.jwt[0]|  (4) SD-JWT
      |                             | 驗 proof、配置狀態清單位置、簽卡、刪 session |
      | WS: {status:"issued", …}    |                                   |
      |<----------------------------|                                   |
```

QR 只攜帶 `credential_offer_uri`。皮夾取得 offer 後，用自己的兩道信任閘門決定要不要跟這個主機講話：先比 offer 主機名稱是否在信任清單，再比 `credential_issuer` 的主機名稱是否一致。本站不在數位發展部的清單上，所以只有把本站釘進信任例外的皮夾（有備而來 DEBUG 建置）會走到第 (2) 步。

預授權碼與存取權杖都是 `<session id>.<secret>` 的複合字串：第 (3)、(4) 步的請求沒有帶 session id，Worker 靠前半段找到 Durable Object，由它以常數時間比對後半段。預授權碼只能兌換一次；存取權杖 10 分鐘內有效且只能領一次卡。

## 發出去的卡片

TWDIW 現行卡片是「包在 W3C `vc` 裡的 SD-JWT」，不是 IETF SD-JWT VC。本站照這個方言發：

```text
header   { alg: "ES256", typ: "vc+sd-jwt", kid: "<issuer did>#0" }
payload  { iss: <issuer did:key (jwk_jcs-pub)>, sub: <holder did:key>, jti, iat, nbf, exp,
           cnf: { jwk: <holder P-256 JWK> },
           vc: { type: ["VerifiableCredential", "<card type id>"],
                 credentialSubject: { _sd: [digest…], _sd_alg: "sha-256" },
                 credentialStatus: { type: "StatusList2021Entry", statusListIndex, statusListCredential } } }
compact  <jws>~<disclosure>~…~<disclosure>~          （尾端 `~`，沒有 key-binding JWT）
```

- 發行者 `iss` 是 `did:key:z2dmz…`（multicodec `jwk_jcs-pub`），公鑰就在識別子裡；有備而來的 `TWDIWCredentialReader` 只用 `iss` 驗簽章，`jku` 不會被追蹤。
- 持有人金鑰來自皮夾 proof JWT 的 `kid`（也是 `jwk_jcs-pub` did:key）或 header `jwk`；`cnf.jwk` 寫入同一把鍵，皮夾入庫前會比對它與自己的裝置金鑰。
- 每個欄位一個 disclosure（`base64url(JSON([salt, name, value]))`），16 bytes 鹽，`_sd` 排序後寫入，避免摘要順序透露欄位順序。
- `vc.type[1]` 是卡種識別子，全部帶 `sandbox` 字樣，皮夾的發行者對照表會把它標成測試卡，而不是冒充公路局或電信商。

## 狀態清單

每張卡佔用 `GET /status/1` 這份 StatusList2021 的一個位置（由 `IssuerIdentity` 配置，131,072 位）。清單 JWT 由同一把發行者金鑰簽，`sub` 等於清單 URL，`credentialSubject.encodedList` 是 gzip 後 base64 的位串，索引 MSB-first。請出示皮夾的 verifier 讀得懂這個格式，會把本站的卡顯示為「狀態清單確認為有效」。目前沒有撤銷操作介面；`IssuerIdentity.revoke(index)` 已有實作但未接到 HTTP。

## 出示測試（同頁的查驗端）

本站同時是一個 OIDC4VP verifier，用同一把 did:key 當 `client_id` 簽署 request object，request 內容與請出示皮夾相同（`response_mode: direct_post`、Presentation Exchange 加 DCQL、`limit_disclosure: required`、`$.type` 過濾卡種）。收到 `vp_token` 後：

1. 外層 VP JWT：以 header `jwk` 驗簽章、比對 `aud` 與 `nonce`。
2. 內層 SD-JWT：以 `iss` did:key 內嵌公鑰驗發卡簽章、重算每個 disclosure 摘要、讀狀態清單。
3. 綁定：內層 `cnf.jwk` 的 thumbprint 必須等於外層簽章金鑰。
4. 卡種：`vc.type[1]` 必須等於這次請求的卡種。

**信任政策只有一條：只信任本站自己的 DID。** 它會拒絕政府卡與任何其他發行者的卡，因為它沒有別的信任來源。這是「卡片是完整的、綁在皮夾金鑰上」的示範，不是「別人應該接受這張卡」的證明。

## 信任清單

頁面即時讀取 `frontend.wallet.gov.tw/api/did`（`size=20`、從 `page=0` 開始、`orgType=1` 與 `2`、`status=1`、讀到空頁為止，依 DID 合併），並對本站的 DID 做請出示皮夾同一種單筆查詢。預期結果是「官方信任 API 沒有這筆啟用中的 DID」；頁面把這個回答與「誰接受本站」並列：

| 對象 | 接受？ | 原因 |
|---|---|---|
| 本站的出示測試 | 是 | 只信任自己的 did:key |
| 有備而來 DEBUG 建置 | 是 | 以 `TWDIWIssuer.mashbeanSandbox` 釘住 DID 與主機名稱；Release 不包含 |
| 數位發展部數位憑證皮夾 | 否 | 本站不在官方信任清單 |
| 請出示皮夾 | 否 | 政府卡以官方 DID API 為唯一信任來源，fail closed |

## 資料保存

- `IssuerIdentity`：私鑰、公鑰、DID、下一個狀態清單位置、已撤銷位置。永久。
- `IssuanceSession`：卡種 id、虛構持卡人 id、皮夾種類、resultKey、code secret、access secret、c_nonce、`client_id` 回音。發卡完成或 10 分鐘 alarm 即 `deleteAll()`。卡片本身不寫入。
- `PresentationSession`：nonce、state、resultKey、卡種、要求欄位。查驗完成或 10 分鐘 alarm 即刪除。presentation 與揭露值只在單次請求記憶體中。
- 頁面：發卡結果（含虛構欄位值）10 分鐘後清除，出示結果 2 分鐘後清除。沒有 analytics、沒有第三方 script。

## 標準範圍

發卡端實作 OpenID for Verifiable Credential Issuance 1.0 的 pre-authorized code flow（offer by reference、`/.well-known/openid-credential-issuer`、`/token`、`/credential`、`openid4vci-proof+jwt`）。卡片格式與出示端採 TWDIW 相容 profile。這不是 OpenID Foundation conformance 的宣稱；若需要跨國或 mdoc 互通，應另建純 SD-JWT VC／DCQL profile 並跑 conformance suite。
