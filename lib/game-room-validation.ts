export function normalizeRoomCode(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-F0-9]{6}$/.test(code) ? code : null;
}

export function parseDeckId(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function gameRoomErrorMessage(message?: string) {
  if (!message) return "対戦ルームを処理できませんでした。";
  if (message.includes("deck_must_have_40_main_cards")) return "40枚ちょうどのデッキを選んでください。";
  if (message.includes("deck_not_found")) return "選択したデッキが見つかりません。";
  if (message.includes("room_not_available")) return "ルームが見つからないか、受付を終了しています。";
  if (message.includes("host_cannot_join_as_guest")) return "自分で作成したルームには参加できません。";
  if (message.includes("deck_format_mismatch")) return "ルームと同じフォーマットのデッキを選んでください。";
  return "対戦ルームを処理できませんでした。少し待ってから再度お試しください。";
}
