const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/;

export function parseCanonicalCardId(value: unknown): number | null {
  if (typeof value !== "string" || !POSITIVE_DECIMAL_ID.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
