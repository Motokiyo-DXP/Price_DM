import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const PROFILE_ICON_SIZE = 128;
export const PROFILE_ICON_MAX_INPUT_BYTES = 8 * 1024 * 1024;

export function validateAccountName(value: string) {
  const name = value.trim();
  return name.length >= 1 && name.length <= 30 ? name : null;
}

export async function compressProfileIcon(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください。");
  if (file.size > PROFILE_ICON_MAX_INPUT_BYTES) throw new Error("元画像は8MB以下にしてください。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_ICON_SIZE;
    canvas.height = PROFILE_ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を圧縮できませんでした。");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, PROFILE_ICON_SIZE, PROFILE_ICON_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78));
    if (!blob) throw new Error("画像をWebPへ変換できませんでした。");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadProfileIcon(supabase: SupabaseClient<Database>, userId: string, file: File) {
  const blob = await compressProfileIcon(file);
  const path = `${userId}/icon.webp`;
  const { error } = await supabase.storage.from("profile-icons").upload(path, blob, { cacheControl: "3600", contentType: "image/webp", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("profile-icons").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (profileError) throw profileError;
  return avatarUrl;
}
