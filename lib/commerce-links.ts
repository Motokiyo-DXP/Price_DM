export type CommerceLink = {
  name: string;
  description: string;
  href: string;
};

function isDuelMasters(gameName: string) {
  const normalized = gameName.normalize("NFKC").toLowerCase();
  return normalized.includes("デュエル") || normalized.includes("duel master");
}

export function createCommerceLinks(
  cardName: string,
  gameName: string,
): CommerceLink[] {
  const name = cardName.trim();
  if (!name) return [];

  const marketplaceKeyword = [gameName.trim(), name].filter(Boolean).join(" ");
  const links: CommerceLink[] = [
    {
      name: "メルカリ",
      description: "フリマ出品を検索",
      href: `https://jp.mercari.com/search?keyword=${encodeURIComponent(marketplaceKeyword)}`,
    },
  ];

  if (!isDuelMasters(gameName)) return links;

  links.push(
    {
      name: "カードラッシュ",
      description: "通販在庫を検索",
      href: `https://www.cardrush-dm.jp/product-list?keyword=${encodeURIComponent(name)}`,
    },
    {
      name: "カーナベル",
      description: "通販在庫を検索",
      href: `https://www.ka-nabell.com/?act=sell_search&genre=7&key_word=${encodeURIComponent(name)}`,
    },
    {
      name: "CBトレコロ",
      description: "デュエマ通販を見る",
      href: "https://www.torecolo.jp/shop/c/c1020/",
    },
  );

  return links;
}
