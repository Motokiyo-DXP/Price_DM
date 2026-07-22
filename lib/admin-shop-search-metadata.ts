export type AdminShopSearchMetadata = {
  id: number;
  name: string;
  nameKana: string | null;
  aliases: string[];
};

type AdminRpcClient = {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

function parseShop(value: unknown): AdminShopSearchMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 ||
    typeof row.name !== "string" ||
    (row.name_kana !== null && typeof row.name_kana !== "string") ||
    !Array.isArray(row.aliases) || !row.aliases.every((alias) => typeof alias === "string")
  ) return null;
  return { id: row.id, name: row.name, nameKana: row.name_kana as string | null, aliases: row.aliases as string[] };
}

export async function loadShopSearchMetadata(client: unknown) {
  const { data, error } = await (client as AdminRpcClient).rpc(
    "list_shop_search_metadata_for_admin", { p_limit: 500 },
  );
  if (error) throw new Error(error.code ?? error.message);
  if (!Array.isArray(data)) throw new Error("invalid_admin_shop_search_metadata_response");
  const shops = data.map(parseShop);
  if (shops.some((shop) => shop === null)) throw new Error("invalid_admin_shop_search_metadata_response");
  return shops as AdminShopSearchMetadata[];
}

export async function updateShopSearchMetadata(
  client: unknown,
  input: { shopId: number; nameKana: string; aliases: string[] },
) {
  const { error } = await (client as AdminRpcClient).rpc(
    "update_shop_search_metadata_for_admin",
    { p_shop_id: input.shopId, p_name_kana: input.nameKana || null, p_aliases: input.aliases },
  );
  if (error) throw new Error(error.code ?? error.message);
}
