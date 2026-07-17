create or replace function public.submit_price_record_session_v2(
  p_session_token text,
  p_canonical_card_id bigint,
  p_shop_name text,
  p_card_print_id bigint default null,
  p_sale_price integer default null,
  p_buy_price integer default null,
  p_stock_status public.stock_status default 'unknown',
  p_observed_on date default current_date,
  p_contributor_name text default null,
  p_note text default null,
  p_attribute_slugs text[] default '{}'::text[]
)
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_price_record_session_v2_impl(
    p_session_token, p_canonical_card_id, p_shop_name, p_card_print_id,
    p_sale_price, p_buy_price, p_stock_status, p_observed_on,
    p_contributor_name, p_note, p_attribute_slugs
  );
$$;

revoke all on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;
grant price_registration_executor to postgres with set true;
set role price_registration_executor;
grant execute on function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;
reset role;
revoke price_registration_executor from postgres granted by postgres;
grant execute on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;

