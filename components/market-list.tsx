"use client";
import { useEffect,useMemo,useState } from "react";
import { demoCards } from "@/lib/demo-data";
import { CardSummary,Trend } from "@/lib/types";
const yen=(n:number|null)=>n==null?"—":`${n.toLocaleString("ja-JP")}円`;
const cls=(trend:Trend,stale:boolean)=>stale?"stale":trend==="up"?"up":trend==="down"?"down":"";
export function MarketList(){
 const [query,setQuery]=useState(""); const [onlyFav,setOnlyFav]=useState(false); const [favorites,setFavorites]=useState<string[]>([]);
 useEffect(()=>{setFavorites(JSON.parse(localStorage.getItem("tcg-favorites")||"[]"))},[]);
 const toggle=(id:string)=>setFavorites(old=>{const next=old.includes(id)?old.filter(x=>x!==id):[...old,id];localStorage.setItem("tcg-favorites",JSON.stringify(next));return next});
 const cards=useMemo(()=>demoCards.filter(c=>(c.name+c.setCode).toLowerCase().includes(query.toLowerCase())&&(!onlyFav||favorites.includes(c.id))),[query,onlyFav,favorites]);
 return <><section className="hero"><p className="eyebrow">みんなで共有するカード相場</p><h1>価格の動きを、ひと目で。</h1><p>カード名を検索し、販売・買取価格と在庫状況を記録できます。</p></section><section className="toolbar"><input aria-label="カード検索" placeholder="カード名・収録番号で検索" value={query} onChange={e=>setQuery(e.target.value)}/><button className={onlyFav?"active":""} onClick={()=>setOnlyFav(v=>!v)}>★ 気になる</button></section><div className="grid">{cards.map((card:CardSummary)=>{const stale=Date.now()-new Date(card.updatedAt).getTime()>30*86400000;return <article className={stale?"card muted":"card"} key={card.id}><div className="card-head"><div><span className="tag">{card.game}</span><h2>{card.name}</h2><small>{card.setCode||"収録番号未登録"}</small></div><button className="star" aria-label="気になる" onClick={()=>toggle(card.id)}>{favorites.includes(card.id)?"★":"☆"}</button></div><div className="prices"><div><small>販売価格</small><strong className={cls(card.saleTrend,stale)}>{yen(card.salePrice)}</strong></div><div><small>買取価格</small><strong className={cls(card.buyTrend,stale)}>{yen(card.buyPrice)}</strong></div></div><footer><span>{card.stock}</span><span>{stale?"30日以上更新なし":"最近更新"}</span></footer></article>})}</div>{cards.length===0&&<p className="empty">該当するカードはありません。</p>}<p className="demo-note">初期表示は動作確認用データです。Supabase接続後に実データへ切り替えてください。</p></>;
}
