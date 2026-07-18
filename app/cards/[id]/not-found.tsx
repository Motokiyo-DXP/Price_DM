import Link from "next/link";

export default function CardNotFound() {
  return (
    <section className="detail-error">
      <h1>カード相場が見つかりません</h1>
      <p>URLが正しいか、一覧に価格が登録されているかをご確認ください。</p>
      <Link className="button" href="/">
        相場一覧へ戻る
      </Link>
    </section>
  );
}
