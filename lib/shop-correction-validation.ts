import { JAPAN_PREFECTURES } from "./prefectures.ts";

export type ValidatedShopCorrection = {
  shopId: number;
  name: string;
  nameKana: string;
  aliases: string[];
  prefecture: string;
  municipality: string;
  addressLine: string;
  websiteUrl: string;
  reason: string;
};

export type ShopCorrectionValidationResult =
  | { ok: true; value: ValidatedShopCorrection }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "invalid_shop"
        | "no_changes"
        | "too_long"
        | "invalid_prefecture"
        | "invalid_website_url";
    };

const prefectures = new Set<string>(JAPAN_PREFECTURES);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function aliases(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const alias = text(item);
    return alias ? [alias] : [];
  }))];
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

export function validateShopCorrectionBody(
  input: unknown,
): ShopCorrectionValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "invalid_request" };
  }

  const body = input as Record<string, unknown>;
  const shopId = body.shopId;
  const value = {
    shopId: typeof shopId === "number" ? shopId : 0,
    name: text(body.name),
    nameKana: text(body.nameKana),
    aliases: aliases(body.aliases),
    prefecture: text(body.prefecture),
    municipality: text(body.municipality),
    addressLine: text(body.addressLine),
    websiteUrl: text(body.websiteUrl),
    reason: text(body.reason),
  };

  if (!Number.isSafeInteger(value.shopId) || value.shopId <= 0) {
    return { ok: false, error: "invalid_shop" };
  }
  if (
    value.name.length > 200 ||
    value.nameKana.length > 200 ||
    value.aliases.length > 20 ||
    value.aliases.some((alias) => alias.length > 200) ||
    value.prefecture.length > 20 ||
    value.municipality.length > 100 ||
    value.addressLine.length > 300 ||
    value.websiteUrl.length > 500 ||
    value.reason.length > 2000
  ) {
    return { ok: false, error: "too_long" };
  }
  if (value.prefecture && !prefectures.has(value.prefecture)) {
    return { ok: false, error: "invalid_prefecture" };
  }
  if (value.websiteUrl && !isHttpUrl(value.websiteUrl)) {
    return { ok: false, error: "invalid_website_url" };
  }
  if (!value.reason) {
    return { ok: false, error: "invalid_request" };
  }
  if (
    !value.name &&
    !value.nameKana &&
    value.aliases.length === 0 &&
    !value.prefecture &&
    !value.municipality &&
    !value.addressLine &&
    !value.websiteUrl
  ) {
    return { ok: false, error: "no_changes" };
  }

  return { ok: true, value };
}
