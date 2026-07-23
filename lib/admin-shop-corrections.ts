import type { Database } from "./database.types";

type ShopCorrectionRow =
  Database["public"]["Functions"]["list_pending_shop_corrections_for_admin"]["Returns"][number];

export type AdminShopCorrection = ShopCorrectionRow;

type AdminRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function client(value: unknown) {
  return value as AdminRpcClient;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableStringArray(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function parseShopCorrection(value: unknown): AdminShopCorrection | null {
  const row = record(value);
  if (!row) return null;
  if (
    typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 ||
    typeof row.shop_id !== "number" || !Number.isSafeInteger(row.shop_id) || row.shop_id <= 0 ||
    typeof row.original_name !== "string" ||
    !nullableText(row.original_name_kana) ||
    !Array.isArray(row.original_aliases) ||
    !row.original_aliases.every((item) => typeof item === "string") ||
    !nullableText(row.original_prefecture) ||
    !nullableText(row.original_municipality) ||
    !nullableText(row.original_address_line) ||
    !nullableText(row.original_website_url) ||
    !nullableText(row.proposed_name) ||
    !nullableText(row.proposed_name_kana) ||
    !nullableStringArray(row.proposed_aliases) ||
    !nullableText(row.proposed_prefecture) ||
    !nullableText(row.proposed_municipality) ||
    !nullableText(row.proposed_address_line) ||
    !nullableText(row.proposed_website_url) ||
    typeof row.reason !== "string" ||
    typeof row.submitted_at !== "string" ||
    Number.isNaN(Date.parse(row.submitted_at))
  ) return null;
  return row as AdminShopCorrection;
}

export async function loadPendingShopCorrections(adminClient: unknown) {
  const { data, error } = await client(adminClient).rpc(
    "list_pending_shop_corrections_for_admin",
    { p_limit: 100 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) throw new Error("invalid_admin_shop_correction_response");
  const corrections = data.map(parseShopCorrection);
  if (corrections.some((correction) => correction === null)) {
    throw new Error("invalid_admin_shop_correction_response");
  }
  return corrections as AdminShopCorrection[];
}

export async function reviewShopCorrection(
  adminClient: unknown,
  input: { requestId: number; decision: "approved" | "rejected"; reviewNote: string },
) {
  const { error } = await client(adminClient).rpc(
    "review_shop_correction_for_admin",
    {
      p_request_id: input.requestId,
      p_decision: input.decision,
      p_review_note: input.reviewNote || undefined,
    },
  );
  if (error) throw new Error(error.code ?? error.message);
}
