const JAPAN_TIME_ZONE = "Asia/Tokyo";

export function formatJapaneseDate(dateTime: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(dateTime));
}
