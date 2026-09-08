"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CardArtwork } from "@/components/card-artwork";
import { assignDeckFolderAction, copyDeckAction, createDeckFolderAction, createFolderAndAssignDeckAction, deleteDeckAction, setDeckIconAction, toggleDeckVisibilityAction } from "@/app/decks/actions";
export type DeckListItem={id:string;name:string;format:string;visibility:string;description:string;updatedAt:string;folderId:string|null;count:number;imageUrl:string|null;iconChoices:{canonicalCardId:number;name:string;imageUrl:string|null}[]};
export type DeckFolder={id:string;name:string};
export function MyDecksBrowser({decks,folders}:{decks:DeckListItem[];folders:DeckFolder[]}){
 const[query,setQuery]=useState("");const[folder,setFolder]=useState("all");const[selected,setSelected]=useState<DeckListItem|null>(null);const[iconDeck,setIconDeck]=useState<DeckListItem|null>(null);const[showFolderForm,setShowFolderForm]=useState(false);const[showModalFolderForm,setShowModalFolderForm]=useState(false);const[shareDone,setShareDone]=useState(false);
 const shown=useMemo(()=>decks.filter(d=>d.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(folder==="all"||(folder==="none"?!d.folderId:d.folderId===folder))),[decks,query,folder]);
 const folderName=(id:string|null)=>folders.find(f=>f.id===id)?.name??"未分類";
 return <div className="my-decks-browser">
  <div className="my-decks-filters"><label><span>⌕</span><input aria-label="デッキ名で検索" onChange={e=>setQuery(e.target.value)} placeholder="マイデッキ名" value={query}/></label><select aria-label="フォルダで分類" onChange={e=>setFolder(e.target.value)} value={folder}><option value="all">すべてのフォルダ</option><option value="none">未分類</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><button onClick={()=>setShowFolderForm(v=>!v)} type="button">＋ フォルダ</button></div>
  {showFolderForm?<form action={createDeckFolderAction} className="deck-folder-form"><input autoFocus maxLength={60} name="name" placeholder="新しいフォルダ名" required/><button type="submit">作成</button></form>:null}
  <p className="my-decks-result">{shown.length}件のデッキ</p>
  <div className="my-decks-list">{shown.map(d=><article className="my-deck-row" key={d.id}><button aria-label={`${d.name}のアイコンを変更`} className="my-deck-icon-button" onClick={()=>setIconDeck(d)} type="button"><CardArtwork eager imageUrl={d.imageUrl} name={d.name} sizes="230px"/><span>アイコン変更</span></button><button className="my-deck-details-button" onClick={()=>setSelected(d)} type="button"><span className="my-deck-info"><strong>{d.name}</strong><span className="my-deck-badges"><em>{d.format==="advanced"?"アドバンス":d.format==="duel_party"?"デュエパーティ":"オリジナル"}</em><em>{folderName(d.folderId)}</em></span><span className="my-deck-counts"><span>メイン <b>{d.count}</b></span><span>超GR <b>0</b></span><span>超次元 <b>0</b></span></span><small>{d.visibility==="public"?"公開":"非公開"}　{new Date(d.updatedAt).toLocaleDateString("ja-JP")}</small></span></button></article>)}</div>
  {!shown.length?<div className="history-empty"><strong>該当するデッキがありません</strong><p>検索条件を変えるか、新しいデッキを作成してください。</p></div>:null}
  <Link aria-label="新しいデッキを作成" className="floating-deck-create" href="/decks/new"><span>▱</span>デッキ作成</Link>
  {iconDeck?<div className="deck-actions-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setIconDeck(null)}}><section aria-modal="true" className="deck-icon-modal" role="dialog"><header><div><strong>デッキアイコンを選択</strong><small>{iconDeck.name}に含まれるカード</small></div><button aria-label="閉じる" onClick={()=>setIconDeck(null)}>×</button></header><div className="deck-icon-choices">{iconDeck.iconChoices.map(choice=><form action={setDeckIconAction} key={choice.canonicalCardId}><input name="deckId" type="hidden" value={iconDeck.id}/><input name="canonicalCardId" type="hidden" value={choice.canonicalCardId}/><button title={choice.name} type="submit"><CardArtwork imageUrl={choice.imageUrl} name={choice.name} sizes="110px"/><span>{choice.name}</span></button></form>)}</div>{!iconDeck.iconChoices.length?<p>アイコンに選べるカードがありません。</p>:null}</section></div>:null}
  {selected?<div className="deck-actions-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
    <section aria-modal="true" className="deck-actions-modal" role="dialog">
      <header><strong>{selected.name}</strong><button aria-label="閉じる" onClick={()=>setSelected(null)}>×</button></header>
      <div className="deck-action-grid">
        <Link href={`/decks/${selected.id}/edit`}><span>✎</span>編集</Link>
        <form action={copyDeckAction}><input name="deckId" type="hidden" value={selected.id}/><button type="submit"><span>▣</span>コピー</button></form>
        <Link href={`/playtest/${selected.id}/opponent`}><span aria-hidden="true" className="ui-icon ui-icon-my-decks" />一人回し</Link>
        <form action={deleteDeckAction}><input name="deckId" type="hidden" value={selected.id}/><button className="danger" type="submit"><span aria-hidden="true" className="ui-icon ui-icon-trash" />削除</button></form>
      </div>
      <form action={assignDeckFolderAction} className="deck-folder-select-row"><input name="deckId" type="hidden" value={selected.id}/><select aria-label="含めるフォルダ" defaultValue={selected.folderId??""} name="folderId"><option value="">未分類</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><button type="submit">変更</button></form>
      <button className="folder-create-assign" onClick={()=>setShowModalFolderForm(v=>!v)} type="button">＋ フォルダ新規作成＆デッキ追加</button>
      {showModalFolderForm?<form action={createFolderAndAssignDeckAction} className="modal-folder-create"><input name="deckId" type="hidden" value={selected.id}/><input autoFocus maxLength={60} name="name" placeholder="新しいフォルダ名" required/><button type="submit">作成して追加</button></form>:null}
      <button className="deck-share-button" onClick={async()=>{await navigator.clipboard.writeText(`${window.location.origin}/playtest/${selected.id}`);setShareDone(true)}} type="button">⌯　{shareDone?"URLをコピーしました":"デッキを共有"}</button>
      <form action={toggleDeckVisibilityAction} className="deck-modal-row"><input name="deckId" type="hidden" value={selected.id}/><input name="visibility" type="hidden" value={selected.visibility==="public"?"private":"public"}/><span>デッキ公開</span><button aria-label="公開状態を切り替え" className={selected.visibility==="public"?"toggle active":"toggle"} type="submit"><i/></button></form>
    </section>
  </div>:null}
 </div>;
}
