export type ValidatedShopSearchMetadata = {
  shopId: number;
  nameKana: string;
  aliases: string[];
};

function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

export function validateShopSearchMetadataInput(
  shopIdValue: unknown,
  nameKanaValue: unknown,
  aliasesValue: unknown,
): ValidatedShopSearchMetadata | null {
  const shopIdText = trimmedString(shopIdValue);
  const nameKana = trimmedString(nameKanaValue);
  const aliasesInput = trimmedString(aliasesValue);
  if (
    shopIdText === null ||
    nameKana === null ||
    aliasesInput === null ||
    !/^[1-9][0-9]*$/u.test(shopIdText) ||
    nameKana.length > 200 ||
    aliasesInput.length > 2000
  ) return null;

  const shopId = Number(shopIdText);
  if (!Number.isSafeInteger(shopId)) return null;
  const aliases = [...new Set(
    aliasesInput.split(/\r?\n|,/u).map((value) => value.trim()).filter(Boolean),
  )];
  if (aliases.length > 20 || aliases.some((alias) => alias.length > 200)) return null;
  return { shopId, nameKana, aliases };
}
