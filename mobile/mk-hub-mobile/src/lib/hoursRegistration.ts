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

const EMPLOYMENT_ALIASES: Record<string, string> = {
  salary: "Salary",
  salaried: "Salary",
  hourly: "Hourly",
  hour: "Hourly",
  hours: "Hourly",
  "full-time": "Full-time",
  "full time": "Full-time",
  fulltime: "Full-time",
  "part-time": "Part-time",
  "part time": "Part-time",
  parttime: "Part-time"
};

/** Map free-text employment type onto Full-time | Hourly | Part-time | Salary. */
export function employmentTypeLabel(raw?: string | null): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text === "Full-time" || text === "Hourly" || text === "Part-time" || text === "Salary") return text;
  const key = text.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  return EMPLOYMENT_ALIASES[key] || EMPLOYMENT_ALIASES[key.replace(/ /g, "-")] || text;
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
