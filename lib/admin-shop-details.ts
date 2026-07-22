import type { ValidatedAdminShopDetails } from "./admin-shop-details-validation.ts";

export type AdminShopDetails = {
  id: number;
  name: string;
  nameKana: string | null;
  aliases: string[];
  prefecture: string | null;
  municipality: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
};

type AdminRpcClient = {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalText(value: unknown, maxLength: number): value is string | null {
  return isNullableString(value) && (value === null || value.length <= maxLength);
}

function parseShop(value: unknown): AdminShopDetails | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "number" ||
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    typeof row.name !== "string" ||
    row.name.length < 1 ||
    row.name.length > 200 ||
    !isOptionalText(row.name_kana, 200) ||
    !Array.isArray(row.aliases) ||
    row.aliases.length > 20 ||
    !row.aliases.every((alias) => typeof alias === "string" && alias.length <= 200) ||
    !isOptionalText(row.prefecture, 20) ||
    !isOptionalText(row.municipality, 100) ||
    !isOptionalText(row.address_line, 300) ||
    !isOptionalText(row.website_url, 500)
  ) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    nameKana: row.name_kana,
    aliases: row.aliases,
    prefecture: row.prefecture,
    municipality: row.municipality,
    addressLine: row.address_line,
    websiteUrl: row.website_url,
  };
}

export async function loadAdminShopDetails(client: unknown) {
  const { data, error } = await (client as AdminRpcClient).rpc(
    "list_shop_details_for_admin",
    { p_limit: 500 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) {
    throw new Error("invalid_admin_shop_details_response");
  }

  const shops = data.map(parseShop);
  if (shops.some((shop) => shop === null)) {
    throw new Error("invalid_admin_shop_details_response");
  }
  return shops as AdminShopDetails[];
}

export async function updateAdminShopDetails(
  client: unknown,
  input: ValidatedAdminShopDetails,
) {
  const { error } = await (client as AdminRpcClient).rpc(
    "update_shop_details_for_admin",
    {
      p_shop_id: input.shopId,
      p_name: input.name,
      p_name_kana: input.nameKana || null,
      p_aliases: input.aliases,
      p_prefecture: input.prefecture,
      p_municipality: input.municipality || null,
      p_address_line: input.addressLine || null,
      p_website_url: input.websiteUrl || null,
    },
  );
  if (error) {
    throw new Error(error.code === "42501" ? error.code : error.message);
  }
}
