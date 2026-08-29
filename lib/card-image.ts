const DEFAULT_CARD_IMAGE_BASE_URL = "/cards";

export function getCardImageUrl(imageKey: string | null | undefined) {
  if (!imageKey) return null;
  const segments = imageKey.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return null;
  const base = (process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL || DEFAULT_CARD_IMAGE_BASE_URL).replace(/\/$/, "");
  return `${base}/${segments.map(encodeURIComponent).join("/")}.webp`;
}
