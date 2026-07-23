const GENERIC_LOGIN_ERROR =
  "ログイン用メールを送信できませんでした。時間をおいて再試行してください。";

export function adminLoginErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null) return GENERIC_LOGIN_ERROR;

  const authError = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const code = typeof authError.code === "string" ? authError.code : "";
  const message = typeof authError.message === "string" ? authError.message : "";

  if (
    authError.status === 429 ||
    code === "over_email_send_rate_limit" ||
    /rate.?limit/i.test(message)
  ) {
    return "メール送信回数の上限に達しました。時間をおいてから再試行してください。";
  }

  return GENERIC_LOGIN_ERROR;
}
