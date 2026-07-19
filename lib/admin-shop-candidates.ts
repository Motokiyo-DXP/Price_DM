export type AdminShopCandidate = {
  id: number;
  name: string;
  prefecture: string | null;
  municipality: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
  submissionCount: number;
  submittedAt: string;
  lastSubmittedAt: string;
};

type AdminRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function adminRpcClient(client: unknown) {
  return client as AdminRpcClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseCandidate(value: unknown): AdminShopCandidate | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = row.id;
  const name = row.name;
  const submissionCount = row.submission_count;
  const submittedAt = row.submitted_at;
  const lastSubmittedAt = row.last_submitted_at;
  const prefecture = row.prefecture;
  const municipality = row.municipality;
  const addressLine = row.address_line;
  const websiteUrl = row.website_url;
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof name !== "string" ||
    typeof submissionCount !== "number" ||
    !Number.isSafeInteger(submissionCount) ||
    submissionCount <= 0 ||
    typeof submittedAt !== "string" ||
    typeof lastSubmittedAt !== "string" ||
    !isNullableString(prefecture) ||
    !isNullableString(municipality) ||
    !isNullableString(addressLine) ||
    !isNullableString(websiteUrl)
  ) {
    return null;
  }

  return {
    id,
    name,
    prefecture,
    municipality,
    addressLine,
    websiteUrl,
    submissionCount,
    submittedAt,
    lastSubmittedAt,
  };
}

export async function loadPendingShopCandidates(client: unknown) {
  const { data, error } = await adminRpcClient(client).rpc(
    "list_pending_shop_candidates_for_admin",
    { p_limit: 100 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) throw new Error("invalid_admin_candidate_response");

  const candidates = data.map(parseCandidate);
  if (candidates.some((candidate) => candidate === null)) {
    throw new Error("invalid_admin_candidate_response");
  }
  return candidates as AdminShopCandidate[];
}

export async function reviewShopCandidate(
  client: unknown,
  input: { candidateId: number; decision: "approved" | "rejected"; reviewNote: string },
) {
  const { data, error } = await adminRpcClient(client).rpc(
    "review_shop_candidate_for_admin",
    {
      p_candidate_id: input.candidateId,
      p_decision: input.decision,
      p_review_note: input.reviewNote || null,
    },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("invalid_admin_review_response");
  }
}
