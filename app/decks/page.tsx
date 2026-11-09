export { generateDeckDirectoryMetadata as generateMetadata } from "@/lib/deck-directory-metadata";
import { DeckDirectory } from "@/components/deck-directory";
import { MyDecksContent } from "@/components/my-decks-content";
import { PublicDeckContent } from "@/components/public-deck-content";
import "./directory.css";

export const dynamic = "force-dynamic";

export default function DecksPage() {
  return <section className="decks-page my-decks-page">
    <div className="primary-page-title"><h1>デッキ</h1><div className="directory-accent" aria-hidden="true" /></div>
    <DeckDirectory myDecks={<MyDecksContent />} publicDecks={<PublicDeckContent />} />
  </section>;
}
