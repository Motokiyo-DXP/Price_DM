import {
  validateAdminShopRegistrationInput,
  type ValidatedAdminShopRegistration,
} from "./admin-shop-registration-validation.ts";

export type ValidatedAdminShopDetails = Omit<
  ValidatedAdminShopRegistration,
  "reviewNote"
> & {
  shopId: number;
};

export function validateAdminShopDetailsInput(
  shopIdValue: unknown,
  nameValue: unknown,
  nameKanaValue: unknown,
  aliasesValue: unknown,
  prefectureValue: unknown,
  municipalityValue: unknown,
  addressLineValue: unknown,
  websiteUrlValue: unknown,
): ValidatedAdminShopDetails | null {
  if (
    typeof shopIdValue !== "string" ||
    !/^[1-9][0-9]*$/u.test(shopIdValue)
  ) {
    return null;
  }

  const shopId = Number(shopIdValue);
  if (!Number.isSafeInteger(shopId)) return null;

  const details = validateAdminShopRegistrationInput(
    nameValue,
    nameKanaValue,
    aliasesValue,
    prefectureValue,
    municipalityValue,
    addressLineValue,
    websiteUrlValue,
    "",
  );
  if (!details) return null;

  const { reviewNote: _reviewNote, ...shopDetails } = details;
  return { shopId, ...shopDetails };
}

