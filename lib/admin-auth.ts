export const ADMIN_EMAIL = "mossan.sushi@gmail.com";

export function isAdminEmail(email: unknown): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === ADMIN_EMAIL;
}
