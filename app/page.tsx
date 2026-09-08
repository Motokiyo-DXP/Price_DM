import { MarketList } from "@/components/market-list";
import { loadMarketCards } from "@/lib/market-data";

export const revalidate = 300;

export default async function Home() {
  const { cards, error } = await loadMarketCards();
  return <MarketList initialCards={cards} loadError={error} />;
}
