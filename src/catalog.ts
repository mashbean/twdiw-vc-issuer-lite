// The test data this issuer hands out: a small set of card types that are
// common in daily life, and a small set of fictional people to put on them.
//
// Everything here is invented. The names are the placeholder names Taiwanese
// forms use for examples, the national ID numbers are generated with a valid
// check digit so format validators accept them but they belong to nobody, the
// phone numbers sit in an unassigned-looking block, and every organisation is a
// 「沙盒」 (sandbox) organisation that does not exist. The card type identifiers
// all carry the word `sandbox` so a wallet's issuer directory names them as
// test cards rather than dressing them up as a real 公路局 or carrier card.
//
// Claim keys are chosen to match what the 有備而來 wallet already knows how to
// label (its field-label table) and what the 請出示皮夾 verifier profiles ask
// for, so a card collected here reads naturally on the phone and can be
// presented back to the verifier demo on the same page.

export type CardFamily = "transport" | "telecom" | "education" | "workplace" | "library" | "membership";

export interface ClaimSpec {
  key: string;
  label: string;
}

export interface CardType {
  /** `vc.type[1]` and the OID4VCI credential configuration id. Contains `sandbox`. */
  id: string;
  name: string;
  nameEnglish: string;
  /** The human card kind, e.g. 駕照電子卡. */
  kind: string;
  family: CardFamily;
  description: string;
  /** The fictional organisation named on the card face. */
  issuerDisplay: string;
  validityDays: number;
  claims: ClaimSpec[];
  /** The claims the embedded presentation demo asks for — a subset, so the
   *  wallet's selective disclosure is visible. */
  presentClaims: string[];
}

export interface Persona {
  id: string;
  name: string;
  gender: "男" | "女";
  birthdate: string;
  idNumber: string;
  address: string;
  phone: string;
  email: string;
  school: string;
  department: string;
  studentId: string;
  enrollmentYear: string;
  employer: string;
  employeeId: string;
  role: string;
  licenseType: string;
  memberTier: string;
  /** One line for the picker. */
  summary: string;
}

const LETTER_CODES: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21,
  N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

/** Appends the check digit to a nine-character prefix (`A1` + seven digits). */
export function withCheckDigit(prefix: string): string {
  if (!/^[A-Z][12]\d{7}$/.test(prefix)) throw new Error("national id prefix must be a letter, 1 or 2, and seven digits");
  const code = LETTER_CODES[prefix[0]];
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let index = 1; index <= 8; index += 1) sum += Number(prefix[index]) * (9 - index);
  return prefix + String((10 - (sum % 10)) % 10);
}

/** The same check the verifier applies to `id_number`. */
export function isTaiwanNationalId(value: unknown): boolean {
  const id = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z][12]\d{8}$/.test(id)) return false;
  const code = LETTER_CODES[id[0]];
  if (!code) return false;
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let index = 1; index <= 8; index += 1) sum += Number(id[index]) * (9 - index);
  sum += Number(id[9]);
  return sum % 10 === 0;
}

export const PERSONAS: Persona[] = [
  {
    id: "wang-xiaoming",
    name: "王小明",
    gender: "男",
    birthdate: "1990-03-15",
    idNumber: withCheckDigit("A12345678"),
    address: "臺北市中正區測試路 1 號 3 樓",
    phone: "0900000101",
    email: "xiaoming.wang@sandbox.example",
    school: "國立沙盒大學",
    department: "資訊工程學系（在職專班）",
    studentId: "S1140001",
    enrollmentYear: "114",
    employer: "沙盒科技股份有限公司",
    employeeId: "E-2018-0042",
    role: "資深工程師",
    licenseType: "普通小型車",
    memberTier: "金卡",
    summary: "36 歲工程師，最常見的範例姓名",
  },
  {
    id: "chen-meiling",
    name: "陳美玲",
    gender: "女",
    birthdate: "1985-11-02",
    idNumber: withCheckDigit("B22345678"),
    address: "新北市板橋區示範街 22 巷 5 號",
    phone: "0900000102",
    email: "meiling.chen@sandbox.example",
    school: "沙盒科技大學",
    department: "護理系",
    studentId: "N1130217",
    enrollmentYear: "113",
    employer: "沙盒醫療財團法人附設醫院",
    employeeId: "H-0931",
    role: "護理師",
    licenseType: "普通重型機車",
    memberTier: "銀卡",
    summary: "40 歲護理師，機車駕照",
  },
  {
    id: "lin-zhihao",
    name: "林志豪",
    gender: "男",
    birthdate: "2003-07-21",
    idNumber: withCheckDigit("C13456789"),
    address: "臺中市西區沙盒路 100 號",
    phone: "0900000103",
    email: "zhihao.lin@sandbox.example",
    school: "國立沙盒大學",
    department: "電機工程學系",
    studentId: "B1105012",
    enrollmentYear: "110",
    employer: "沙盒大學研究助理專案",
    employeeId: "RA-2026-07",
    role: "研究助理",
    licenseType: "普通輕型機車",
    memberTier: "一般",
    summary: "23 歲大學生，兼任研究助理",
  },
  {
    id: "zhang-yating",
    name: "張雅婷",
    gender: "女",
    birthdate: "1998-01-30",
    idNumber: withCheckDigit("D24567890"),
    address: "高雄市左營區樣本大道 8 號 12 樓",
    phone: "0900000104",
    email: "yating.zhang@sandbox.example",
    school: "沙盒大學",
    department: "公共行政研究所",
    studentId: "M1131234",
    enrollmentYear: "113",
    employer: "沙盒市政府社會局",
    employeeId: "G-2024-118",
    role: "約聘人員",
    licenseType: "普通小型車",
    memberTier: "一般",
    summary: "28 歲研究生，公部門約聘",
  },
  {
    id: "huang-jianhong",
    name: "黃建宏",
    gender: "男",
    birthdate: "1972-05-09",
    idNumber: withCheckDigit("E15678901"),
    address: "臺南市東區演示路三段 45 號",
    phone: "0900000105",
    email: "jianhong.huang@sandbox.example",
    school: "沙盒社區大學",
    department: "數位公民學程",
    studentId: "C1150098",
    enrollmentYear: "115",
    employer: "沙盒物流股份有限公司",
    employeeId: "L-0207",
    role: "運務主任",
    licenseType: "職業大貨車",
    memberTier: "金卡",
    summary: "54 歲運務主任，職業大貨車駕照",
  },
  {
    id: "li-jiaying",
    name: "李佳穎",
    gender: "女",
    birthdate: "2007-12-12",
    idNumber: withCheckDigit("F26789012"),
    address: "桃園市中壢區模擬街 66 號",
    phone: "0900000106",
    email: "jiaying.li@sandbox.example",
    school: "沙盒高級中學",
    department: "普通科",
    studentId: "H1120456",
    enrollmentYear: "112",
    employer: "沙盒便利商店（打工）",
    employeeId: "P-7731",
    role: "門市人員",
    licenseType: "普通輕型機車",
    memberTier: "一般",
    summary: "18 歲高中生，剛滿成年",
  },
];

export const CARD_TYPES: CardType[] = [
  {
    id: "sandbox_driverlicense_car_v1",
    name: "駕照電子卡（測試）",
    nameEnglish: "Driver licence (test)",
    kind: "駕照電子卡",
    family: "transport",
    description: "模仿公路局駕照電子卡的欄位：姓名、統一編號、地址、駕照種類與效期。",
    issuerDisplay: "沙盒公路監理所",
    validityDays: 365 * 6,
    claims: [
      { key: "name", label: "姓名" },
      { key: "id_number", label: "國民身分證統一編號" },
      { key: "birthdate", label: "出生日期" },
      { key: "address", label: "地址" },
      { key: "license_type", label: "駕照種類" },
      { key: "license_conditions", label: "駕照條件" },
      { key: "issue_date", label: "發證日期" },
      { key: "expiry_date", label: "有效期限" },
    ],
    presentClaims: ["name", "license_type"],
  },
  {
    id: "sandbox_telecom_msisdn_v1",
    name: "門號電子卡（測試）",
    nameEnglish: "Phone-number card (test)",
    kind: "門號電子卡",
    family: "telecom",
    description: "模仿電信門號電子卡：姓名、手機末三碼、末五碼與完整門號。",
    issuerDisplay: "沙盒電信股份有限公司",
    validityDays: 365,
    claims: [
      { key: "name", label: "姓名" },
      { key: "phonel5", label: "手機末五碼" },
      { key: "phonel3", label: "手機末三碼" },
      { key: "phone_number", label: "行動電話" },
      { key: "carrier", label: "電信業者" },
    ],
    presentClaims: ["name", "phonel5"],
  },
  {
    id: "sandbox_student_card_v1",
    name: "學生證（測試）",
    nameEnglish: "Student card (test)",
    kind: "學生證",
    family: "education",
    description: "校園常見的學生證：學號、學校、系所、入學年度與效期。",
    issuerDisplay: "沙盒大學教務處",
    validityDays: 365,
    claims: [
      { key: "name", label: "姓名" },
      { key: "student_id", label: "學號" },
      { key: "school", label: "學校" },
      { key: "department", label: "系所" },
      { key: "enrollment_year", label: "入學學年度" },
      { key: "birthdate", label: "出生日期" },
      { key: "expiry_date", label: "有效期限" },
    ],
    presentClaims: ["name", "school"],
  },
  {
    id: "sandbox_employee_badge_v1",
    name: "員工識別證（測試）",
    nameEnglish: "Employee badge (test)",
    kind: "員工識別證",
    family: "workplace",
    description: "職場門禁與報到常用的識別證：員工編號、單位、職稱與電子郵件。",
    issuerDisplay: "沙盒科技股份有限公司人資部",
    validityDays: 365 * 2,
    claims: [
      { key: "name", label: "姓名" },
      { key: "employee_id", label: "員工編號" },
      { key: "organization", label: "服務單位" },
      { key: "department", label: "部門" },
      { key: "role", label: "職稱" },
      { key: "email", label: "電子郵件" },
      { key: "valid_from", label: "生效日期" },
      { key: "expiry_date", label: "有效期限" },
    ],
    presentClaims: ["name", "organization", "role"],
  },
  {
    id: "sandbox_library_card_v1",
    name: "圖書借閱證（測試）",
    nameEnglish: "Library card (test)",
    kind: "圖書借閱證",
    family: "library",
    description: "公共圖書館借閱證：借閱證號、館別與效期，示範只出示證號不出示姓名。",
    issuerDisplay: "沙盒市立圖書館",
    validityDays: 365 * 3,
    claims: [
      { key: "name", label: "姓名" },
      { key: "card_number", label: "借閱證號" },
      { key: "library", label: "館別" },
      { key: "valid_from", label: "生效日期" },
      { key: "expiry_date", label: "有效期限" },
    ],
    presentClaims: ["card_number"],
  },
  {
    id: "sandbox_membership_card_v1",
    name: "會員卡（測試）",
    nameEnglish: "Membership card (test)",
    kind: "會員卡",
    family: "membership",
    description: "商家或合作社會員卡：會員編號、等級與效期。",
    issuerDisplay: "沙盒生活合作社",
    validityDays: 365,
    claims: [
      { key: "name", label: "姓名" },
      { key: "member_id", label: "會員編號" },
      { key: "tier", label: "會員等級" },
      { key: "organization", label: "發卡單位" },
      { key: "valid_from", label: "生效日期" },
      { key: "expiry_date", label: "有效期限" },
    ],
    presentClaims: ["name", "tier"],
  },
];

export function getCard(id: unknown): CardType | undefined {
  return typeof id === "string" ? CARD_TYPES.find((card) => card.id === id) : undefined;
}

export function getPersona(id: unknown): Persona | undefined {
  return typeof id === "string" ? PERSONAS.find((persona) => persona.id === id) : undefined;
}

/** A label for a claim key, from the first card that names it. */
export function claimLabel(key: string): string {
  for (const card of CARD_TYPES) {
    const claim = card.claims.find((item) => item.key === key);
    if (claim) return claim.label;
  }
  return key;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Deterministic for a given `now`, so a test can pin the output. */
export function claimsFor(card: CardType, persona: Persona, now = new Date()): Record<string, string> {
  const validFrom = isoDate(plusDays(now, -30));
  const expiry = isoDate(plusDays(now, card.validityDays));
  const values: Record<string, string> = {
    name: persona.name,
    id_number: persona.idNumber,
    birthdate: persona.birthdate,
    address: persona.address,
    license_type: persona.licenseType,
    license_conditions: "無",
    issue_date: isoDate(plusDays(now, -365 * 2)),
    expiry_date: expiry,
    phonel5: persona.phone.slice(-5),
    phonel3: persona.phone.slice(-3),
    phone_number: persona.phone,
    carrier: "沙盒電信",
    student_id: persona.studentId,
    school: persona.school,
    department: persona.department,
    enrollment_year: persona.enrollmentYear,
    employee_id: persona.employeeId,
    organization: card.family === "membership" ? card.issuerDisplay : persona.employer,
    role: persona.role,
    email: persona.email,
    valid_from: validFrom,
    card_number: `LIB-${persona.idNumber.slice(1, 4)}-${persona.phone.slice(-4)}`,
    library: card.issuerDisplay,
    member_id: `M${persona.enrollmentYear}${persona.phone.slice(-4)}`,
    tier: persona.memberTier,
  };
  const claims: Record<string, string> = {};
  for (const claim of card.claims) claims[claim.key] = values[claim.key];
  return claims;
}

/** What the page shows: everything except internals the wallet does not need. */
export function publicCatalog(now = new Date()) {
  return {
    cards: CARD_TYPES.map((card) => ({
      id: card.id,
      name: card.name,
      nameEnglish: card.nameEnglish,
      kind: card.kind,
      family: card.family,
      description: card.description,
      issuerDisplay: card.issuerDisplay,
      validityDays: card.validityDays,
      claims: card.claims.map((claim) => ({ ...claim })),
      presentClaims: [...card.presentClaims],
    })),
    personas: PERSONAS.map((persona) => ({
      id: persona.id,
      name: persona.name,
      summary: persona.summary,
      preview: Object.fromEntries(CARD_TYPES.map((card) => [card.id, claimsFor(card, persona, now)])),
    })),
  };
}
