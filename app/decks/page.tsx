import { redirect } from "next/navigation";
import { MyDecksBrowser, type DeckListSortMode } from "@/components/my-decks-browser";
import { getCardImageUrl } from "@/lib/card-image";
import { sortCardPrintsOldestFirst } from "@/lib/card-print-order";
import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
export const dynamic="force-dynamic";
export default async function DecksPage(){
 const supabase=await createAuthServerSupabaseClient();if(!supabase)redirect("/login");
 const{data:claims,error:authError}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(authError||typeof userId!=="string")redirect("/login");
 const[{data:decks,error},{data:folders},{data:profile}]=await Promise.all([supabase.from("decks").select("id, name, format, visibility, description, created_at, updated_at, folder_id, icon_canonical_card_id, user_sort_order, deck_cards(canonical_card_id, card_print_id, quantity, zone, canonical_cards(name))").eq("owner_id",userId).order("user_sort_order"),supabase.from("deck_folders").select("id, name, user_sort_order").eq("owner_id",userId).order("user_sort_order"),supabase.from("profiles").select("deck_list_sort_mode, unfiled_folder_sort_order").eq("user_id",userId).maybeSingle()]);
 const ids=[...new Set((decks??[]).flatMap(d=>d.deck_cards.filter(c=>c.zone==="main").map(c=>c.canonical_card_id)))];
 const{data:prints}=ids.length?await supabase.from("card_prints").select("id, canonical_card_id, image_key, product_name, card_number, official_card_id").in("canonical_card_id",ids).not("image_key","is",null).order("id"):{data:[]};
 const images=new Map<number,string>();const printImages=new Map<number,string>();for(const p of sortCardPrintsOldestFirst(prints??[]))if(p.image_key){if(!images.has(p.canonical_card_id))images.set(p.canonical_card_id,p.image_key);printImages.set(p.id,p.image_key)}
 const items=(decks??[]).map(d=>{const main=d.deck_cards.filter(c=>c.zone==="main"),first=d.icon_canonical_card_id??main[0]?.canonical_card_id;const selectedKey=(c:typeof main[number])=>(c.card_print_id?printImages.get(c.card_print_id):null)??images.get(c.canonical_card_id);const seen=new Set<number>();const iconChoices=main.filter(c=>!seen.has(c.canonical_card_id)&&seen.add(c.canonical_card_id)).map(c=>({canonicalCardId:c.canonical_card_id,name:c.canonical_cards?.name??"カード",imageUrl:getCardImageUrl(selectedKey(c))}));const iconCard=main.find(c=>c.canonical_card_id===first);return{id:d.id,name:d.name,format:d.format,visibility:d.visibility,description:d.description,createdAt:d.created_at,updatedAt:d.updated_at,folderId:d.folder_id,userSortOrder:d.user_sort_order,count:main.reduce((s,c)=>s+c.quantity,0),imageUrl:getCardImageUrl(iconCard?selectedKey(iconCard):first?images.get(first):null),iconChoices};});
 const initialSortMode:DeckListSortMode=profile?.deck_list_sort_mode==="newest"?"newest":"user";
 const folderItems=(folders??[]).map(folder=>({id:folder.id,name:folder.name,userSortOrder:folder.user_sort_order}));
 return <section className="decks-page my-decks-page"><div className="primary-page-title"><h1>マイデッキ</h1><div className="directory-accent" aria-hidden="true" /></div>{error?<p className="notice error">デッキを読み込めませんでした。</p>:<MyDecksBrowser decks={items} folders={folderItems} initialSortMode={initialSortMode} initialUnfiledFolderSortOrder={profile?.unfiled_folder_sort_order??2147483647}/>}</section>;
}
