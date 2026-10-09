import mappings from './dm26ex4-canonical-mappings.json' with {type:'json'};
export {mappings};
export function canonicalMapping(card){
 const mapping=mappings.find(m=>m.number==='DM26EX4 '+card.card_number);
 if(mapping&&mapping.source_name!==card.name)throw Error('Audited mapping source name changed');
 return mapping??null;
}
export const canonicalName=card=>canonicalMapping(card)?.canonical_name??card.name;
