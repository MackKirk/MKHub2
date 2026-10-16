/** Who must log hours (and receive hours reminders). */

const HOURLY = new Set(["hourly", "hour", "hours"]);
const SALARY = new Set(["salary", "salaried", "annual", "yearly", "year", "exempt"]);
const CONTRACT = new Set(["contract", "contractor", "commission"]);

export type CanonicalPayType = "hourly" | "salary" | "contract";

/** Map free-text or Bamboo labels onto hourly | salary | contract. */
export function canonicalPayType(payType?: string | null): CanonicalPayType | "" {
  const text = (payType || "").trim().toLowerCase();
  if (!text) return "";
  if (HOURLY.has(text)) return "hourly";
  if (SALARY.has(text)) return "salary";
  if (CONTRACT.has(text)) return "contract";
  if (text.includes("salary") || text.includes("annual") || text.includes("salaried")) return "salary";
  if (text.includes("contract")) return "contract";
  if (text.includes("hour")) return "hourly";
  return "";
}

export function isSalaryPayType(payType?: string | null): boolean {
  return canonicalPayType(payType) === "salary";
}

export function payTypeLabel(payType?: string | null): string {
  const canonical = canonicalPayType(payType);
  if (canonical === "hourly") return "Hourly";
  if (canonical === "salary") return "Salary";
  if (canonical === "contract") return "Contract";
  return (payType || "").trim();
}

export function shouldRegisterHours(
  payType?: string | null,
  needsRegisterHours?: boolean | null
): boolean {
  if (!isSalaryPayType(payType)) return true;
  return Boolean(needsRegisterHours);
}
