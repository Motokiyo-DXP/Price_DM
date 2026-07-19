export type AdminReviewDecision = "approved" | "rejected";

export type ValidatedAdminReview = {
  id: number;
  decision: AdminReviewDecision;
  reviewNote: string;
};

export function validateAdminReviewInput(
  idValue: unknown,
  decisionValue: unknown,
  reviewNoteValue: unknown,
): ValidatedAdminReview | null {
  if (
    typeof idValue !== "string" ||
    !/^[1-9]\d*$/.test(idValue) ||
    typeof decisionValue !== "string" ||
    (decisionValue !== "approved" && decisionValue !== "rejected") ||
    (reviewNoteValue !== null &&
      reviewNoteValue !== undefined &&
      typeof reviewNoteValue !== "string")
  ) {
    return null;
  }

  const id = Number(idValue);
  const reviewNote = (reviewNoteValue ?? "").trim();
  if (!Number.isSafeInteger(id) || id <= 0 || reviewNote.length > 2000) {
    return null;
  }

  return {
    id,
    decision: decisionValue as AdminReviewDecision,
    reviewNote,
  };
}
