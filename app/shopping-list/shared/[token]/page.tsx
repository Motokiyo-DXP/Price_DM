import { notFound } from "next/navigation";
import { ShoppingListLive } from "@/components/shopping-list-live";
export const dynamic = "force-dynamic";
export const metadata = { title: "共有買い物リスト", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function SharedShoppingList({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return <ShoppingListLive token={token} />;
}
