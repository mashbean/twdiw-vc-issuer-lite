// Wording shared by the monitor and its tests, kept out of the Durable Object
// module so it can be exercised without the Workers runtime.

import type { ChainVerdict } from "./chain";

export function describeRoles(orgTypes: number[]): string {
  const parts = orgTypes.map((type) => (type === 1 ? "發行者" : type === 2 ? "驗證者" : `類型 ${type}`));
  return parts.join("＋") || "未標示";
}

export function describeVerdict(verdict: ChainVerdict): string {
  switch (verdict) {
    case "verified": return "鏈上一致";
    case "mismatch": return "與鏈上不符";
    case "notAnchored": return "未上鏈";
    case "unavailable": return "無法查詢";
  }
}
