export type ShopCandidateInput = {
  name: string;
  prefecture: string;
  municipality: string;
  addressLine: string;
  websiteUrl: string;
};

export type ShopCandidateValidationResult =
  | { ok: true; value: ShopCandidateInput }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "invalid_shop"
        | "too_long"
        | "invalid_website_url";
    };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function validateShopCandidateBody(
  input: unknown,
): ShopCandidateValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "invalid_request" };
  }

  const body = input as Record<string, unknown>;
  const value = {
    name: text(body.name),
    prefecture: text(body.prefecture),
    municipality: text(body.municipality),
    addressLine: text(body.addressLine),
    websiteUrl: text(body.websiteUrl),
  };

  if (!value.name || value.name.length > 200) {
    return { ok: false, error: "invalid_shop" };
  }
  if (
    value.prefecture.length > 20 ||
    value.municipality.length > 100 ||
    value.addressLine.length > 300 ||
    value.websiteUrl.length > 500
  ) {
    return { ok: false, error: "too_long" };
  }
  if (value.websiteUrl && !isHttpUrl(value.websiteUrl)) {
    return { ok: false, error: "invalid_website_url" };
  }

  return { ok: true, value };
}
