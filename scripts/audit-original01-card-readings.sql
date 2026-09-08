select
  cards.name,
  terms.term,
  terms.source,
  terms.term_kind
from public.card_search_terms as terms
join public.canonical_cards as cards on cards.id = terms.canonical_card_id
where terms.source = 'original01'
order by cards.name, terms.term;

select id, name
from public.search_canonical_cards('ゼットラッシュ', 'duel-masters', 30, 'broad');
