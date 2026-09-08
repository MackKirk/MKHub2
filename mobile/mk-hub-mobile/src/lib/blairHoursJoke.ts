export const BLAIR_HOURS_USERNAME = "bbennett";

export const BLAIR_HOURS_TITLE = "Blair, have you logged your hours today?";

export const BLAIR_HOURS_PHOTO = require("../../assets/easter-eggs/blair-hours.png");

export function isBlairHoursJoke(username?: string | null): boolean {
  return (username || "").trim().toLowerCase() === BLAIR_HOURS_USERNAME;
}
