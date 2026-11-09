import { DeckEditor } from "@/components/deck-editor";
import "./search.css";

export default function CardSearchPage() {
  return <section className="card-search-page">
    <div className="primary-page-title"><h1>カード検索</h1><div className="directory-accent" aria-hidden="true" /></div>
    <DeckEditor searchOnly />
  </section>;
}
