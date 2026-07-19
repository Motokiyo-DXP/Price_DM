import type { Database } from "./database.types";

type CorrectionRow =
  Database["public"]["Functions"]["list_pending_price_corrections_for_admin"]["Returns"][number];

export type AdminPriceCorrection = CorrectionRow;

type AdminRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function adminRpcClient(client: unknown) {
  return client as AdminRpcClient;
}

export async function loadPendingPriceCorrections(client: unknown) {
  const { data, error } = await adminRpcClient(client).rpc(
    "list_pending_price_corrections_for_admin",
    { p_limit: 100 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) throw new Error("invalid_admin_correction_response");
  return data as AdminPriceCorrection[];
}

export async function reviewPriceCorrection(
  client: unknown,
  input: { requestId: number; decision: "approved" | "rejected"; reviewNote: string },
) {
  const { error } = await adminRpcClient(client).rpc(
    "review_price_correction_for_admin",
    {
      p_decision: input.decision,
      p_request_id: input.requestId,
      p_review_note: input.reviewNote || undefined,
    },
  );
  if (error) throw new Error(error.code ?? error.message);
}
