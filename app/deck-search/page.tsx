export { generateDeckDirectoryMetadata as generateMetadata } from "@/lib/deck-directory-metadata";
import { redirect } from "next/navigation";

export default async function DeckSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  params.set("tab", "search");
  redirect(`/decks?${params}`);
}
