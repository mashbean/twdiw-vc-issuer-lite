# 測試資料

本站只發虛構資料。這份文件說明資料怎麼來、為什麼長這樣，以及自行部署時怎麼換。資料定義在 [`src/catalog.ts`](../src/catalog.ts)，由 `test/catalog.test.ts` 把關。

## 六位虛構持卡人

| id | 姓名 | 出生 | 一句話 |
|---|---|---|---|
| `wang-xiaoming` | 王小明 | 1990-03-15 | 36 歲工程師，最常見的範例姓名 |
| `chen-meiling` | 陳美玲 | 1985-11-02 | 40 歲護理師，機車駕照 |
| `lin-zhihao` | 林志豪 | 2003-07-21 | 23 歲大學生，兼任研究助理 |
| `zhang-yating` | 張雅婷 | 1998-01-30 | 28 歲研究生，公部門約聘 |
| `huang-jianhong` | 黃建宏 | 1972-05-09 | 54 歲運務主任，職業大貨車駕照 |
| `li-jiaying` | 李佳穎 | 2007-12-12 | 18 歲高中生，剛滿成年 |

設計原則：

- **姓名**用台灣表單範例最常出現的名字，一看就知道是假的。
- **統一編號**由 `withCheckDigit()` 產生：字母 A–F、性別碼、七位連號數字加正確檢查碼。格式與檢查碼驗證器會接受（請出示皮夾的統一編號情境就是這樣檢查），但這些號碼不屬於任何人。
- **手機**全部在 `09000001xx`，電子郵件全部在 `@sandbox.example`（RFC 2606 保留網域）。
- **地址、學校、雇主、圖書館、合作社**全是「沙盒」單位，不存在。

## 六種卡片

| id | 名稱 | 欄位 | 出示測試要求 |
|---|---|---|---|
| `sandbox_driverlicense_car_v1` | 駕照電子卡（測試） | name, id_number, birthdate, address, license_type, license_conditions, issue_date, expiry_date | name, license_type |
| `sandbox_telecom_msisdn_v1` | 門號電子卡（測試） | name, phonel5, phonel3, phone_number, carrier | name, phonel5 |
| `sandbox_student_card_v1` | 學生證（測試） | name, student_id, school, department, enrollment_year, birthdate, expiry_date | name, school |
| `sandbox_employee_badge_v1` | 員工識別證（測試） | name, employee_id, organization, department, role, email, valid_from, expiry_date | name, organization, role |
| `sandbox_library_card_v1` | 圖書借閱證（測試） | name, card_number, library, valid_from, expiry_date | card_number |
| `sandbox_membership_card_v1` | 會員卡（測試） | name, member_id, tier, organization, valid_from, expiry_date | name, tier |

欄位鍵的選法：

- 先對齊有備而來的欄位對照表（`name`、`id_number`、`birthdate`、`address`、`license_type`、`phone_number`、`phonel3`、`phonel5`、`carrier`、`issue_date`、`valid_from`、`expiry_date`、`email`、`organization`、`role`、`department`）。皮夾對這些鍵有中文標籤。
- 再對齊請出示皮夾的情境（`name`、`phonel5`、`license_type`、`id_number`）。
- 學生證、員工證、借閱證、會員卡新增的鍵（`student_id`、`school`、`enrollment_year`、`employee_id`、`card_number`、`library`、`member_id`、`tier`）在有備而來 `feat/sandbox-issuer` 分支補進對照表。
- 卡種 id 全帶 `sandbox`，且駕照含 `driverlicense`、門號含 `telecom`，皮夾的卡面顏色與卡別對照才會分別落到綠色駕照與洋紅門號。

日期欄位相對於發卡時間計算：`valid_from` 為 30 天前、`issue_date` 為兩年前、`expiry_date` 為卡種效期之後。同一時刻的輸出是決定性的。

## 換成自己的資料

1. 改 `CARD_TYPES` 與 `PERSONAS`，或把 `claimsFor()` 換成從你的資料來源讀取。
2. 保持卡種 id 對皮夾誠實：不是官方卡就不要用會被對照表誤認成官方機構的字樣。
3. 一旦接進真實個資，`docs/protocol-and-trust.md` 的「資料保存」段落就不再成立，要另外處理告知、合法事由、保存期限與撤銷。
4. 把新站的 did:key 與主機名稱釘進皮夾的信任例外，否則皮夾會在第一道閘門拒絕。
