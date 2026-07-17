export type Trend = "up" | "down" | "same" | "unknown";
export type CardSummary = { id:string; game:string; name:string; setCode?:string; salePrice:number|null; buyPrice:number|null; saleTrend:Trend; buyTrend:Trend; stock:string; updatedAt:string };
