/** Who must log hours (and receive hours reminders). */

export function isSalaryPayType(payType?: string | null): boolean {
  return (payType || "").trim().toLowerCase().includes("salary");
}

export function shouldRegisterHours(
  payType?: string | null,
  needsRegisterHours?: boolean | null
): boolean {
  if (!isSalaryPayType(payType)) return true;
  return Boolean(needsRegisterHours);
}
