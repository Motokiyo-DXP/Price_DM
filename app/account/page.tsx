import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export default async function AccountPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) redirect("/login?next=/account");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) redirect("/login?next=/account");
  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", data.user.id).maybeSingle();
  return <section className="account-page"><p className="eyebrow">アカウント管理</p><h1>マイページ</h1><AccountSettings initialAvatarUrl={profile?.avatar_url ?? null} initialDisplayName={profile?.display_name ?? ""} initialEmail={data.user.email} userId={data.user.id}/></section>;
}
