select jsonb_build_object(
  'unlinked_by_product', (
    select jsonb_agg(row_data order by print_count desc, product_name)
    from (
      select product_name, count(*) as print_count
      from public.card_prints
      where deleted_at is null and product_id is null
      group by product_name
      order by count(*) desc, product_name
      limit 30
    ) row_data
  ),
  'unlinked_known_prefix_samples', (
    select jsonb_agg(row_data order by official_card_id)
    from (
      select prints.official_card_id, prints.card_number, prints.product_name
      from public.card_prints prints
      where prints.deleted_at is null
        and prints.product_id is null
        and exists (
          select 1 from public.card_products products
          where upper(split_part(prints.official_card_id, '-', 1)) = products.product_code
        )
      order by prints.official_card_id
      limit 30
    ) row_data
  )
) as audit;
