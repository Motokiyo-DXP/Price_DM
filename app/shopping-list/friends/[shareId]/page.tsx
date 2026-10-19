import { notFound } from "next/navigation";
import { ShoppingListLive } from "@/components/shopping-list-live";
import { parseShoppingAccess } from "@/lib/shopping-share-access";
export const dynamic = "force-dynamic";
export default async function FriendShoppingList({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!parseShoppingAccess(new URLSearchParams({ share: shareId }))) notFound();
  return <ShoppingListLive shareId={shareId} />;
}
