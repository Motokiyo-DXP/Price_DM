import Link from "next/link";
import { CardArtwork } from "@/components/card-artwork";
import { getCardImageUrl } from "@/lib/card-image";

const samples = [
  { name: "闘門の精霊ウェルキウス", key: "sample/welchius", bytes: 69100 },
  { name: "烈しき切札 ドギラゴン逆", key: "sample/dogiragon-gyaku", bytes: 66416 },
  { name: "世界のY チャクラ・デル・フィン", key: "sample/chakra-delfin", bytes: 91768 },
];

const actualCards = [
  { name: "竜皇神 ボルシャック・バクテラス", key: "official/dm26ex2-MC001", bytes: 75086 },
  { name: "引き裂かれし永劫、エムラクール", key: "official/dm26ex2-PR001", bytes: 68102 },
  { name: "超神星DOOM・ドラゲリオン", key: "official/dm26ex2-PR003", bytes: 78238 },
  { name: "アーテル・ゴルギーニ", key: "official/dm26ex2-PR004", bytes: 73484 },
];

export default function ImagePreviewPage() {
  return (
    <section className="image-preview-page">
      <p className="eyebrow">CARD IMAGE PIPELINE</p>
      <h1>カード画像プレビュー</h1>
      <p>A品質（横384px・WebP品質78）の実装結果です。画像がないカードにはDMの代替表示が出ます。</p>
      <h2>実データ</h2>
      <div className="image-preview-grid">
        {actualCards.map((sample) => (
          <article key={sample.key}>
            <CardArtwork imageUrl={getCardImageUrl(sample.key)} name={sample.name} sizes="(max-width: 700px) 90vw, 320px" />
            <h2>{sample.name}</h2>
            <p>384 × 537px・{(sample.bytes / 1024).toFixed(1)}KB</p>
          </article>
        ))}
      </div>
      <h2>品質比較で使用した3枚</h2>
      <div className="image-preview-grid">
        {samples.map((sample) => (
          <article key={sample.key}>
            <CardArtwork imageUrl={getCardImageUrl(sample.key)} name={sample.name} sizes="(max-width: 700px) 90vw, 320px" />
            <h2>{sample.name}</h2>
            <p>384 × 537px・{(sample.bytes / 1024).toFixed(1)}KB</p>
          </article>
        ))}
        <article>
          <CardArtwork imageUrl={null} name="画像未登録カード" sizes="(max-width: 700px) 90vw, 320px" />
          <h2>画像未登録時</h2>
          <p>読み込み失敗時も同じ表示へ切り替わります。</p>
        </article>
      </div>
      <Link className="button" href="/decks/new">デッキ作成へ</Link>
    </section>
  );
}
