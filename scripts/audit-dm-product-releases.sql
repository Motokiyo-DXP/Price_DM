select
  (select count(*) from public.card_products) as products,
  (select count(*) from public.card_products where release_date is not null) as products_with_release_date,
  (select count(*) from public.card_prints where deleted_at is null) as active_card_prints,
  (select count(*) from public.card_prints where deleted_at is null and product_id is not null) as linked_card_prints,
  (select count(*) from public.card_prints prints left join public.card_products products on products.id = prints.product_id where prints.product_id is not null and products.id is null) as broken_product_links,
  (select min(release_date) from public.card_products) as earliest_release_date,
  (select max(release_date) from public.card_products) as latest_release_date;
