const literal = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const fields = ["card_name","card_number","illustration","border","rarity","printed_text","orientation","crop","quality"];

export function buildReviewedImagePatch(rows,{rollback=false,commit=false}={}) {
  if (!rows.length || new Set(rows.map(r=>r.print_id)).size !== rows.length || new Set(rows.map(r=>r.image_key)).size !== rows.length) throw Error("Empty or duplicate release targets");
  for(const r of rows){
    if(!Number.isSafeInteger(r.print_id)||!Number.isSafeInteger(r.before.canonical_card_id)||r.before.manually_locked!==false||r.before.deleted_at!=null
      || r.permission?.user_confirmed_site_use!==true||r.permission?.source_provider!=="NEM"
      || !r.source_url?.startsWith("https://makeshop-multi-images.akamaized.net/nemcard/itemimages/")
      || fields.some(k=>r.review?.[k]!=="confirmed")||!r.review_evidence
      || !/^[a-f0-9]{64}$/.test(r.after?.sha256??"")
      || r.image_key!==`official/${r.official_card_id}-reviewed-sha256-${r.after.sha256}`
      || r.official_card_id!==r.before.official_card_id||!Number.isSafeInteger(r.after.height)||r.after.height<1
      || !Number.isSafeInteger(r.after.byte_size)||r.after.byte_size<1||r.after.width!==384
      || r.source.width<384||r.source.width<=r.before_asset.width||r.source.height<=r.before_asset.height)throw Error(`Unapproved image ${r.print_id}`);
  }
  const statements=rows.map(r=>{
    const b=r.before,a=r.after;
    const invariant=`p.id=${r.print_id} and p.canonical_card_id=${b.canonical_card_id} and p.official_card_id=${literal(b.official_card_id)}\n and p.card_number is not distinct from ${literal(b.card_number)} and p.product_name is not distinct from ${literal(b.product_name)}\n and p.official_url is not distinct from ${literal(b.official_url)} and p.deleted_at is null and p.manually_locked=false`;
    if(rollback)return `with changed as (update public.card_prints p set image_key=${literal(b.image_key)},image_width=${b.image_width},image_height=${b.image_height},image_byte_size=${b.image_byte_size},image_updated_at=${literal(b.image_updated_at)}::timestamptz\n where ${invariant} and p.image_key=${literal(r.image_key)} and p.image_width=384 and p.image_height=${a.height} and p.image_byte_size=${a.byte_size} returning p.id) select count(*) into affected from changed;\n if affected<>1 then raise exception 'Image rollback snapshot conflict for ${r.print_id}'; end if;`;
    return `with changed as (update public.card_prints p set image_key=${literal(r.image_key)},image_width=384,image_height=${a.height},image_byte_size=${a.byte_size},image_updated_at=pg_catalog.now()\n where ${invariant} and p.image_key=${literal(b.image_key)} and p.image_width=${b.image_width} and p.image_height=${b.image_height} and p.image_byte_size=${b.image_byte_size}\n and p.image_updated_at is not distinct from ${literal(b.image_updated_at)}::timestamptz\n and p.updated_at is not distinct from ${literal(b.updated_at)}::timestamptz returning p.id) select count(*) into affected from changed;\n if affected<>1 then raise exception 'Image snapshot conflict for ${r.print_id}'; end if;`;
  });
  return `-- Release owner only. All new R2 objects must pass public GET/hash verification before APPLY.\nbegin;\ndo $image_release$\ndeclare affected integer;\nbegin\n${statements.join("\n")}\nend $image_release$;\n${commit?"commit":"rollback"};\n`;
}

export function transactionBody(sql) {
  const marker="\nbegin;\n",index=sql.indexOf(marker);
  if(index<0||!/(commit|rollback);\n$/.test(sql))throw Error("Unexpected transaction framing");
  return sql.slice(index+marker.length).replace(/(?:commit|rollback);\n$/,"");
}
