import {load} from 'cheerio';
import {parseOfficialCardPowerValue} from './import-dm-cards-sample.mjs';

export const PRODUCT_URL='https://dm.takaratomy.co.jp/product/dm26ex4/';
export const SET_URL='https://m.dmwiki.net/DM26-EX4';
export const nameKey=s=>String(s??'').normalize('NFKC').replace(/\s*[／/]\s*/gu,'/').trim();
const compact=s=>String(s??'').replace(/\s+/gu,' ').trim();
export function normalizeNumber(number){
 const n=String(number??'').replace(/[\uFE0E\uFE0F]/gu,'').replace(/[０-９]/gu,c=>String(c.charCodeAt(0)-0xFF10)).trim();
 const m=n.match(/^(\d+)([ab]?)\/99$|^超G(\d+)\/超G12$|^超(\d+)\/超50$|^㊙(\d+)([ab]?)\/㊙25$/u);
 if(!m)return null;
 const value=Number(m[1]??m[3]??m[4]??m[5]),max=m[1]?99:m[3]?12:m[4]?50:25;
 return value>=1&&value<=max?n:null;
}
export function parseSetList(html){
 const $=load(html), rows=[],deferred=[];let rarity='';
 $('#body h4,#body li').each((_,e)=>{
  if(e.tagName==='h4'){const h=$(e).clone();h.find('.anchor_super,.editsection').remove();rarity=compact(h.text());return;}
  const t=$(e).text();for(const m of t.matchAll(/《([^》]*)》\s*（([^）]*)）/gu)){
   if(!/\/99|\/超|\/㊙/u.test(m[2]))continue;
   const name=compact(m[1]),number=normalizeNumber(m[2]);
   if(!name||!number){deferred.push({name,number:m[2],rarity,reason:'name_or_number_unconfirmed'});continue;}
   rows.push({name,card_number:number,rarity,source_url:SET_URL,source:'dmwiki',verified:false});
  }
 });
 return {rows,deferred};
}
function plain($,e){const n=$(e).clone();n.find('rt,rp,.anchor_super,.editsection').remove();n.find('br').replaceWith('\n');return n.text().trim();}
const CIVILIZATIONS=new Map([['光','light'],['水','water'],['闇','darkness'],['火','fire'],['自然','nature'],['ゼロ','zero'],['無色','zero']]);
function observed(value){return {status:'observed',value};}
const unavailable=()=>({status:'unavailable',value:null});
const absent=()=>({status:'not_applicable',value:null});
function headingReading($,node){
 const h=$(node).clone();h.find('.anchor_super,.editsection,rp').remove();
 const fragments=h.find('ruby rt').map((_,e)=>compact($(e).text())).get().filter(Boolean);
 h.find('ruby').each((_,e)=>$(e).replaceWith($(e).find('rt').text()));
 const reading=compact(h.text()).replace(/^《|》$/gu,'');
 return {reading:/[一-鿿㐀-䶿豈-﫿]/u.test(reading)?null:reading,fragments:[...new Set(fragments)]};
}
export function parseWikiDetail(html,expectedName,sourceUrl){
 const $=load(html),heading=$('#body h2').first();
 const name=plain($,heading).match(/^《(.+)》$/u)?.[1];
 if(!name||nameKey(name)!==nameKey(expectedName))return {name:expectedName,matched:false,reason:'page_name_mismatch',source_url:sourceUrl};
 const reading=headingReading($,heading),faces=[];
 const table=$('#body table.style_table').first();
 let face=null;
 for(const tr of table.find('tr').toArray()){
  const text=plain($,tr);if(!text)continue;
  const header=text.match(/^(.*?)　([^　]*)　([^　]*?)(?:文明)?[　 ]*[（(]([^）)]*)[）)]$/u);
  if(header){
   const civText=header[3].replace(/文明$/u,''),civs=civText.split(/[／/]/u).map(s=>CIVILIZATIONS.get(s));
   const costText=header[4].normalize('NFKC');
   const cost=/^\d+$/u.test(costText)&&Number(costText)<=99?observed(Number(costText)):costText==='∞'?observed(null):/^[-ー－]$/u.test(costText)?absent():unavailable();
   face={name:header[1],reading:unavailable(),cost,cost_text:costText,cost_is_infinite:costText==='∞',civilizations:civs.every(Boolean)?observed(civs):unavailable(),rarity:header[2]?observed(header[2]):unavailable(),card_types:unavailable(),races:unavailable(),power:unavailable(),power_value:null,card_texts:[],text_status:'unavailable'};
   faces.push(face);continue;
  }
  if(!face)continue;
  if(face.card_types.status==='unavailable'){
   const [typesRaces,power]=text.split(/　+/u),[types,races]=typesRaces.split(/[：:]/u);
   if(!types||!/(クリーチャー|呪文|オーラ|フィールド|タマシード|クロスギア|城|コア|フォートレス|ウェポン|Artifact)/u.test(types))continue;
   face.card_types=observed(types.split(/[／/]/u));
   face.races=races?observed(races.split(/[／/]/u)):absent();
   face.power=power?observed(power):types.includes('クリーチャー')?unavailable():absent();
   face.power_value=power?parseOfficialCardPowerValue(power):null;continue;
  }
  if(/^(覚醒後|覚醒前|龍解後|龍解前|裏面|表面|裏返した後|変身後).*?[⇒→]/u.test(text))continue;
  face.card_texts.push(text);face.text_status='observed';
 }
 const readFaces=reading.reading?.split(/[／/]/u);
 if(readFaces?.length===faces.length)faces.forEach((f,i)=>f.reading=observed(readFaces[i].trim()));
 const setHeading=$('#body h3').filter((_,e)=>$(e).text().includes('収録セット')).first();
 const prints=[];
 setHeading.nextUntil('h2,h3').find('li').each((_,e)=>{
  const text=plain($,e);
  for(const m of text.matchAll(/DM26-EX4[^（）]*（([^）]+)）/gu)){
   const number=normalizeNumber(m[1]);if(number)prints.push(number);
  }
 });
 const linkedFaces=table.find('a[title]').map((_,e)=>$(e).attr('title')).get().filter(t=>/^《.+》$/.test(t)).map(t=>t.slice(1,-1));
 return {name,matched:true,source:'dmwiki',verified:false,source_url:sourceUrl,reading:reading.reading?observed(reading.reading):unavailable(),reading_fragments:reading.fragments,faces,related_faces:linkedFaces,prints:[...new Set(prints)]};
}
export function projectMetadata(record){
 const faces=record.faces??[],first=faces[0];if(!first||faces.some(f=>f.card_types.status!=='observed'))return null;
 const union=key=>[...new Set(faces.flatMap(f=>f[key].status==='observed'?f[key].value:[]))];
 return {name:record.name,name_kana:record.reading.status==='observed'?record.reading.value:null,
   cost:first.cost.status==='observed'?first.cost.value:null,cost_is_infinite:first.cost_is_infinite,
   civilizations:union('civilizations'),card_types:union('card_types'),races:union('races'),
   power_text:first.power.status==='observed'?first.power.value:null,power_value:first.power_value,
   card_texts:faces.every(f=>f.text_status==='observed')?faces.map(f=>f.card_texts.join('\n')):null};
}
