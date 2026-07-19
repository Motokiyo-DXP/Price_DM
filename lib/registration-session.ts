export const REGISTRATION_SESSION_COOKIE = "tcg-registration-session";
export const REGISTRATION_SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export function isRegistrationSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
