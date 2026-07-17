import { MarketList } from "@/components/market-list";
import { loadMarketCards } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { cards, error } = await loadMarketCards();
  return <MarketList initialCards={cards} loadError={error} />;
}
