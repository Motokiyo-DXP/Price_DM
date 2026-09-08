update public.canonical_cards
set cost = case name
  when 'ヨビニオン・マルル' then 4
  when '天災 デドダム' then 3
  else cost
end
where name in ('ヨビニオン・マルル', '天災 デドダム')
  and cost is null;
