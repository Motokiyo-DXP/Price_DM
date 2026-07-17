import { CardSummary } from "./types";
export const demoCards: CardSummary[] = [
 {id:"1",game:"デュエル・マスターズ",name:"ボルシャック・ドラゴン",setCode:"DM-01 S4/S10",salePrice:980,buyPrice:650,saleTrend:"up",buyTrend:"same",stock:"在庫あり",updatedAt:new Date().toISOString()},
 {id:"2",game:"デュエル・マスターズ",name:"ボルメテウス・ホワイト・ドラゴン",salePrice:3480,buyPrice:2200,saleTrend:"down",buyTrend:"down",stock:"残りわずか",updatedAt:new Date(Date.now()-35*86400000).toISOString()}
];
