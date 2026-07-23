import { redirect } from "next/navigation";
import { AdminCandidateList } from "@/components/admin-candidate-list";
import { AdminPriceCorrectionList } from "@/components/admin-price-correction-list";
import { AdminShopCorrectionList } from "@/components/admin-shop-correction-list";
import { AdminShopDetailsForm } from "@/components/admin-shop-details-form";
import { AdminShopRegistrationForm } from "@/components/admin-shop-registration-form";
import { loadPendingPriceCorrections } from "@/lib/admin-price-corrections";
import { loadPendingShopCorrections } from "@/lib/admin-shop-corrections";
import { loadPendingShopCandidates } from "@/lib/admin-shop-candidates";
import { loadAdminShopDetails } from "@/lib/admin-shop-details";
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
    const [candidates, corrections, shopCorrections, shops] = await Promise.all([
      loadPendingShopCandidates(supabase),
      loadPendingPriceCorrections(supabase),
      loadPendingShopCorrections(supabase),
      loadAdminShopDetails(supabase),
    ]);
    return (
      <section>
        <p className="eyebrow">管理者専用</p>
        <h1>店舗管理</h1>
        <AdminShopRegistrationForm />
        <AdminShopDetailsForm shops={shops} />
        <h2>店舗候補の確認</h2>
        <p className="form-intro">候補の公式情報を別経路で確認してから処理してください。</p>
        <AdminCandidateList candidates={candidates} />
        <h2>価格修正申請の確認</h2>
        <p className="form-intro">承認すると元の価格記録を無効化し、修正版を新規作成します。</p>
        <AdminPriceCorrectionList corrections={corrections} />
        <h2>店舗情報修正依頼の確認</h2>
        <p className="form-intro">利用者から届いた店舗情報の変更内容を、現行値と比較して確認してください。</p>
        <AdminShopCorrectionList corrections={shopCorrections} />
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
