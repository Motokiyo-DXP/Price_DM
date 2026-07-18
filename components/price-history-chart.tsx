import type { CardPriceHistoryPoint } from "@/lib/types";

type PriceField = "salePrice" | "buyPrice";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 320;
const PADDING = { top: 24, right: 24, bottom: 44, left: 72 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

const yen = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ja-JP")}円`;

const shortDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

function roundedMaximum(value: number) {
  if (value <= 100) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

export function PriceHistoryChart({
  points,
}: {
  points: CardPriceHistoryPoint[];
}) {
  const history = [...points].sort((left, right) =>
    left.observedOn.localeCompare(right.observedOn),
  );

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <strong>日次平均の履歴はまだありません</strong>
        <p>
          収録版を指定しない価格が2日分以上登録されると、ここに推移グラフが表示されます。
        </p>
      </div>
    );
  }

  const values = history.flatMap((point) =>
    [point.salePrice, point.buyPrice].filter(
      (value): value is number => value !== null,
    ),
  );

  if (values.length === 0) {
    return (
      <div className="history-empty">
        <strong>表示できる価格がありません</strong>
        <p>この期間の日次平均には販売価格・買取価格が登録されていません。</p>
      </div>
    );
  }

  const timestamps = history.map((point) =>
    new Date(`${point.observedOn}T00:00:00`).getTime(),
  );
  const minimumTime = Math.min(...timestamps);
  const maximumTime = Math.max(...timestamps);
  const timeRange = maximumTime - minimumTime;
  const maximumPrice = roundedMaximum(Math.max(...values));

  const xForPoint = (index: number) =>
    timeRange === 0
      ? PADDING.left + PLOT_WIDTH / 2
      : PADDING.left +
        ((timestamps[index] - minimumTime) / timeRange) * PLOT_WIDTH;
  const yForPrice = (price: number) =>
    PADDING.top + PLOT_HEIGHT - (price / maximumPrice) * PLOT_HEIGHT;

  const pathFor = (field: PriceField) =>
    history
      .map((point, index) => {
        const price = point[field];
        return price === null
          ? null
          : `${index === 0 ? "M" : "L"} ${xForPoint(index)} ${yForPrice(price)}`;
      })
      .filter((value): value is string => value !== null)
      .join(" ")
      .replace(/^L/, "M");

  const dateLabelIndexes = Array.from(
    new Set([0, Math.floor((history.length - 1) / 2), history.length - 1]),
  );

  return (
    <div className="history-chart-wrap">
      <div className="history-legend" aria-hidden="true">
        <span className="sale">販売平均</span>
        <span className="buy">買取平均</span>
      </div>
      <svg
        className="history-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="price-history-title price-history-description"
      >
        <title id="price-history-title">販売・買取の日次平均価格推移</title>
        <desc id="price-history-description">
          直近180日以内に登録された、収録版指定なし価格の日次平均です。
        </desc>

        {[0, 1, 2, 3, 4].map((index) => {
          const price = maximumPrice * ((4 - index) / 4);
          const y = PADDING.top + PLOT_HEIGHT * (index / 4);
          return (
            <g key={index}>
              <line
                className="chart-grid-line"
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text className="chart-axis-label" x={PADDING.left - 12} y={y + 4}>
                {Math.round(price).toLocaleString("ja-JP")}円
              </text>
            </g>
          );
        })}

        {dateLabelIndexes.map((index) => (
          <text
            className="chart-date-label"
            key={history[index].observedOn}
            textAnchor={
              index === 0 ? "start" : index === history.length - 1 ? "end" : "middle"
            }
            x={xForPoint(index)}
            y={CHART_HEIGHT - 12}
          >
            {shortDate(history[index].observedOn)}
          </text>
        ))}

        <path className="chart-line sale" d={pathFor("salePrice")} />
        <path className="chart-line buy" d={pathFor("buyPrice")} />

        {history.flatMap((point, index) =>
          ([
            ["salePrice", point.salePrice, "sale"],
            ["buyPrice", point.buyPrice, "buy"],
          ] as const).map(([field, price, className]) =>
            price === null ? null : (
              <circle
                className={`chart-point ${className}`}
                cx={xForPoint(index)}
                cy={yForPrice(price)}
                key={`${point.observedOn}-${field}`}
                r="4"
              >
                <title>
                  {point.observedOn} {className === "sale" ? "販売" : "買取"}平均 {yen(price)}
                </title>
              </circle>
            ),
          ),
        )}
      </svg>

      {history.length === 1 && (
        <p className="history-single-note">
          現在は1日分です。2日分以上登録されると価格の線が表示されます。
        </p>
      )}

      <table className="visually-hidden">
        <caption>日次平均価格の一覧</caption>
        <thead>
          <tr>
            <th>日付</th>
            <th>販売平均</th>
            <th>買取平均</th>
          </tr>
        </thead>
        <tbody>
          {history.map((point) => (
            <tr key={point.observedOn}>
              <td>{point.observedOn}</td>
              <td>{yen(point.salePrice)}</td>
              <td>{yen(point.buyPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
