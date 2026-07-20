import { JAPAN_PREFECTURES } from "./prefectures.ts";

const PREFECTURE_SET = new Set<string>(JAPAN_PREFECTURES);

export type ValidatedAdminShopRegistration = {
  name: string;
  prefecture: string;
  municipality: string;
  addressLine: string;
  websiteUrl: string;
  reviewNote: string;
};

function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

export function validateAdminShopRegistrationInput(
  nameValue: unknown,
  prefectureValue: unknown,
  municipalityValue: unknown,
  addressLineValue: unknown,
  websiteUrlValue: unknown,
  reviewNoteValue: unknown,
): ValidatedAdminShopRegistration | null {
  const name = trimmedString(nameValue);
  const prefecture = trimmedString(prefectureValue);
  const municipality = trimmedString(municipalityValue);
  const addressLine = trimmedString(addressLineValue);
  const websiteUrl = trimmedString(websiteUrlValue);
  const reviewNote = trimmedString(reviewNoteValue);

  if (
    name === null ||
    prefecture === null ||
    municipality === null ||
    addressLine === null ||
    websiteUrl === null ||
    reviewNote === null ||
    name.length < 1 ||
    name.length > 200 ||
    prefecture.length < 1 ||
    prefecture.length > 20 ||
    !PREFECTURE_SET.has(prefecture) ||
    municipality.length > 100 ||
    addressLine.length > 300 ||
    websiteUrl.length > 500 ||
    reviewNote.length > 2000
  ) {
    return null;
  }

  if (websiteUrl !== "") {
    try {
      const parsedUrl = new URL(websiteUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return null;
      }
    } catch {
      return null;
    }
  }

  return {
    name,
    prefecture,
    municipality,
    addressLine,
    websiteUrl,
    reviewNote,
  };
}
