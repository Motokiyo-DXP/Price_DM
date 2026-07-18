import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { loadCardDetail, type CardBestPrice } from "@/lib/card-detail-data";

export const dynamic = "force-dynamic";

const yen = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ja-JP")}円`;

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
        new Date(`${value}T00:00:00`),
      )
    : "未登録";

function BestPricePanel({
  title,
  value,
}: {
  title: string;
  value: CardBestPrice | null;
}) {
  return (
    <article className="best-price-panel">
      <small>{title}</small>
      <strong>{value ? yen(value.price) : "—"}</strong>
      {value ? (
        <>
          <p>{value.shopName}</p>
          <p className="detail-meta">
            {formatDate(value.observedOn)}・{value.stock}
          </p>
          {(value.cardNumber || value.productName) && (
            <p className="detail-meta">
              {[value.cardNumber, value.productName].filter(Boolean).join("・")}
            </p>
          )}
          {value.hasCautionAttribute && (
            <p className="caution-badge">状態・特価条件を含む価格です</p>
          )}
        </>
      ) : (
        <p className="detail-meta">価格データがありません</p>
      )}
    </article>
  );
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canonicalCardId = Number(id);

  if (!Number.isSafeInteger(canonicalCardId) || canonicalCardId <= 0) {
    notFound();
  }

  const { card, error } = await loadCardDetail(canonicalCardId);

  if (!card && !error) {
    notFound();
  }

  if (!card) {
    return (
      <section className="detail-error">
        <p className="notice error" role="alert">
          {error}
        </p>
        <Link href="/">← 相場一覧へ戻る</Link>
      </section>
    );
  }

  return (
    <div className="card-detail">
      <Link className="back-link" href="/">
        ← 相場一覧へ戻る
      </Link>

      <section className="detail-heading">
        <span className="tag">{card.game}</span>
        <h1>{card.name}</h1>
        {card.nameKana && <p>{card.nameKana}</p>}
        <p className="detail-meta">
          収録バリエーション {card.printCount}件・最終更新 {formatDate(card.updatedAt)}
        </p>
      </section>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {card.usesPrintFallback && (
        <p className="notice warning">
          このカードは収録違いを指定した価格データのみ登録されています。現在平均は、その価格を参考値として表示しています。
        </p>
      )}

      <section aria-labelledby="average-heading">
        <h2 id="average-heading">現在の平均相場</h2>
        <div className="detail-price-grid">
          <article>
            <small>販売平均（{card.saleRecordCount}件）</small>
            <strong>{yen(card.salePrice)}</strong>
          </article>
          <article>
            <small>買取平均（{card.buyRecordCount}件）</small>
            <strong>{yen(card.buyPrice)}</strong>
          </article>
        </div>
      </section>

      <section aria-labelledby="best-heading">
        <h2 id="best-heading">注目価格</h2>
        <div className="best-price-grid">
          <BestPricePanel title="販売最安" value={card.bestSale} />
          <BestPricePanel title="買取最高" value={card.bestBuy} />
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <div className="section-heading-row">
          <h2 id="history-heading">価格推移</h2>
          <span>直近180日</span>
        </div>
        <PriceHistoryChart points={card.priceHistory} />
        <p className="detail-meta history-help">
          収録版を指定しない価格登録を日ごとに平均しています。
        </p>
      </section>

      <section aria-labelledby="recent-heading">
        <div className="section-heading-row">
          <h2 id="recent-heading">最近の価格登録</h2>
          <span>{card.recentRecords.length}件表示</span>
        </div>

        {card.recentRecords.length === 0 ? (
          <p className="empty detail-empty">価格登録はまだありません。</p>
        ) : (
          <div className="record-list">
            {card.recentRecords.map((record) => (
              <article className={record.isStale ? "record muted" : "record"} key={record.id}>
                <div className="record-heading">
                  <div>
                    <strong>{record.shopName}</strong>
                    <p className="detail-meta">
                      {formatDate(record.observedOn)}・{record.stock}
                    </p>
                  </div>
                  <div className="record-prices">
                    <span>販売 {yen(record.salePrice)}</span>
                    <span>買取 {yen(record.buyPrice)}</span>
                  </div>
                </div>
                {(record.cardNumber || record.productName) && (
                  <p className="detail-meta">
                    {[record.cardNumber, record.productName].filter(Boolean).join("・")}
                  </p>
                )}
                {record.attributeNames.length > 0 && (
                  <div className="attribute-tags">
                    {record.attributeNames.map((attribute) => (
                      <span key={attribute}>{attribute}</span>
                    ))}
                  </div>
                )}
                {record.note && <p className="record-note">{record.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
