import { isRegistrationSessionToken } from "./registration-session.ts";

export type RegistrationSessionRpcResult =
  | {
      status: "ok";
      sessionToken: string;
      expiresAt: string;
    }
  | {
      status: "invalid_pin" | "rate_limited" | "not_configured";
    };

export type RegistrationSessionStatusResponse =
  | { authenticated: false; expiresAt: null }
  | { authenticated: true; expiresAt: string };

export type ShopCandidateResponse =
  | { status: "pending"; candidateId: number }
  | { status: "already_approved"; shopId: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function parseRegistrationSessionRpcResult(
  value: unknown,
): RegistrationSessionRpcResult | null {
  if (!isRecord(value)) return null;

  if (
    value.status === "invalid_pin" ||
    value.status === "rate_limited" ||
    value.status === "not_configured"
  ) {
    return { status: value.status };
  }

  if (
    value.status !== "ok" ||
    !isRegistrationSessionToken(value.session_token) ||
    !isTimestamp(value.expires_at)
  ) {
    return null;
  }

  return {
    status: "ok",
    sessionToken: value.session_token,
    expiresAt: value.expires_at,
  };
}

export function parseRegistrationSessionStatusResponse(
  value: unknown,
): RegistrationSessionStatusResponse | null {
  if (!isRecord(value) || typeof value.authenticated !== "boolean") return null;
  if (!value.authenticated) return { authenticated: false, expiresAt: null };
  if (!isTimestamp(value.expiresAt)) return null;
  return { authenticated: true, expiresAt: value.expiresAt };
}

export function parseShopCandidateResponse(
  value: unknown,
): ShopCandidateResponse | null {
  if (!isRecord(value)) return null;
  if (value.status === "pending" && isPositiveSafeInteger(value.candidate_id)) {
    return { status: "pending", candidateId: value.candidate_id };
  }
  if (
    value.status === "already_approved" &&
    isPositiveSafeInteger(value.shop_id)
  ) {
    return { status: "already_approved", shopId: value.shop_id };
  }
  return null;
}

export function parseApiErrorCode(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.error === "string" && /^[a-z_]{1,64}$/.test(value.error)
    ? value.error
    : null;
}
