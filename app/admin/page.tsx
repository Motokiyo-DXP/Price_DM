import { redirect } from "next/navigation";
import { AdminCandidateList } from "@/components/admin-candidate-list";
import { loadPendingShopCandidates } from "@/lib/admin-shop-candidates";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) {
    return <section className="form-wrap"><h1>接続設定を確認してください</h1></section>;
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") redirect("/admin/login");

  try {
    const candidates = await loadPendingShopCandidates(supabase);
    return (
      <section>
        <p className="eyebrow">管理者専用</p>
        <h1>店舗候補の確認</h1>
        <p className="form-intro">候補の公式情報を別経路で確認してから処理してください。</p>
        <AdminCandidateList candidates={candidates} />
      </section>
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message === "42501") {
      return <section className="form-wrap"><h1>管理権限がありません</h1><p className="form-intro">管理者に利用許可を依頼してください。</p></section>;
    }
    return <section className="form-wrap"><h1>候補を読み込めませんでした</h1><p className="form-intro">時間をおいて再試行してください。</p></section>;
  }
}
