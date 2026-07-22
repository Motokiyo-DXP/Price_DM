export type AdminRegisteredShop = {
  id: number;
  name: string;
  prefecture: string;
  municipality: string | null;
  addressLine: string | null;
  websiteUrl: string | null;
};

type AdminRpcClient = {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseRegisteredShop(value: unknown): AdminRegisteredShop | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.shop_id !== "number" ||
    !Number.isSafeInteger(row.shop_id) ||
    row.shop_id <= 0 ||
    typeof row.shop_name !== "string" ||
    typeof row.prefecture !== "string" ||
    !isNullableString(row.municipality) ||
    !isNullableString(row.address_line) ||
    !isNullableString(row.website_url)
  ) {
    return null;
  }

  return {
    id: row.shop_id,
    name: row.shop_name,
    prefecture: row.prefecture,
    municipality: row.municipality,
    addressLine: row.address_line,
    websiteUrl: row.website_url,
  };
}

function registrationError(error: { code?: string; message: string }) {
  for (const knownError of ["shop_already_exists", "shop_candidate_pending"]) {
    if (error.message.includes(knownError)) return knownError;
  }
  return error.code ?? error.message;
}

export async function createShopForAdmin(
  client: unknown,
  input: {
    name: string;
    nameKana: string;
    aliases: string[];
    prefecture: string;
    municipality: string;
    addressLine: string;
    websiteUrl: string;
    reviewNote: string;
  },
) {
  const { data, error } = await (client as AdminRpcClient).rpc(
    "create_shop_for_admin_with_search",
    {
      p_name: input.name,
      p_name_kana: input.nameKana || null,
      p_aliases: input.aliases,
      p_prefecture: input.prefecture,
      p_municipality: input.municipality || null,
      p_address_line: input.addressLine || null,
      p_website_url: input.websiteUrl || null,
      p_review_note: input.reviewNote || null,
    },
  );
  if (error) throw new Error(registrationError(error));
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("invalid_admin_shop_registration_response");
  }

  const shop = parseRegisteredShop(data[0]);
  if (!shop) throw new Error("invalid_admin_shop_registration_response");
  return shop;
}
