export type RegistrationGame = {
  id: number;
  slug: string;
  name: string;
};

export type RegistrationCardOption = {
  id: number;
  name: string;
  print_count: number;
};

export type RegistrationCardPrint = {
  id: number;
  card_number: string;
  product_name: string;
};

export type RegistrationShopOption = {
  id: number;
  name: string;
  prefecture: string;
  municipality: string;
};

export type RegistrationShopSearchPage = {
  options: RegistrationShopOption[];
  totalCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isDisplayText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isOptionalText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function asRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function mapRegistrationGames(value: unknown): RegistrationGame[] {
  return asRows(value).flatMap((row) => {
    if (
      !isRecord(row) ||
      !isPositiveId(row.id) ||
      !isDisplayText(row.name, 100) ||
      typeof row.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
      row.slug.length > 64
    ) {
      return [];
    }
    return [{ id: row.id, slug: row.slug, name: row.name }];
  });
}

export function mapRegistrationCardOptions(
  value: unknown,
): RegistrationCardOption[] {
  return asRows(value).flatMap((row) => {
    if (
      !isRecord(row) ||
      !isPositiveId(row.id) ||
      !isDisplayText(row.name, 300) ||
      !isNonNegativeInteger(row.print_count)
    ) {
      return [];
    }
    return [{ id: row.id, name: row.name, print_count: row.print_count }];
  });
}

export function mapRegistrationCardPrints(
  value: unknown,
): RegistrationCardPrint[] {
  return asRows(value).flatMap((row) => {
    if (
      !isRecord(row) ||
      !isPositiveId(row.id) ||
      !isOptionalText(row.card_number, 100) ||
      !isOptionalText(row.product_name, 300)
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        card_number: row.card_number,
        product_name: row.product_name,
      },
    ];
  });
}

export function mapRegistrationShopOptions(
  value: unknown,
): RegistrationShopOption[] {
  return asRows(value).flatMap((row) => {
    if (
      !isRecord(row) ||
      !isPositiveId(row.id) ||
      !isDisplayText(row.name, 200) ||
      !(row.prefecture === null || isOptionalText(row.prefecture, 20)) ||
      !(row.municipality === null || isOptionalText(row.municipality, 100))
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        name: row.name,
        prefecture: row.prefecture ?? "",
        municipality: row.municipality ?? "",
      },
    ];
  });
}

export function mapRegistrationShopSearchPage(
  value: unknown,
): RegistrationShopSearchPage {
  const rows = asRows(value);
  if (rows.length === 0) return { options: [], totalCount: 0 };

  const options = mapRegistrationShopOptions(rows);
  const totalCount = isRecord(rows[0]) && isNonNegativeInteger(rows[0].total_count)
    ? rows[0].total_count
    : null;
  if (
    totalCount === null ||
    totalCount < options.length ||
    options.length !== rows.length ||
    rows.some((row) => !isRecord(row) || row.total_count !== totalCount)
  ) {
    return { options: [], totalCount: 0 };
  }
  return { options, totalCount };
}
