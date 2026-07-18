-- Add an approved-shop-id price-registration boundary. Older name-based
-- functions remain available during the deployment transition and are revoked
-- by a follow-up migration after the application is confirmed on v3.

grant price_registration_executor to postgres with set true;
set role price_registration_executor;

create or replace function private.submit_price_record_session_v3_impl(
  p_session_token text,
  p_canonical_card_id bigint,
  p_shop_id bigint,
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_shop_name text;
begin
  select shops.name
  into v_shop_name
  from public.shops as shops
  where shops.id = p_shop_id;

  if v_shop_name is null then
    return -5;
  end if;

  return private.submit_price_record_session_v2_impl(
    p_session_token,
    p_canonical_card_id,
    v_shop_name,
    p_card_print_id,
    p_sale_price,
    p_buy_price,
    p_stock_status,
    p_observed_on,
    p_contributor_name,
    p_note,
    p_attribute_slugs
  );
end;
$$;

revoke all on function private.submit_price_record_session_v3_impl(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;
grant execute on function private.submit_price_record_session_v3_impl(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;

set role postgres;
revoke price_registration_executor from postgres granted by postgres;

create or replace function public.submit_price_record_session_v3(
  p_session_token text,
  p_canonical_card_id bigint,
  p_shop_id bigint,
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
  select private.submit_price_record_session_v3_impl(
    p_session_token,
    p_canonical_card_id,
    p_shop_id,
    p_card_print_id,
    p_sale_price,
    p_buy_price,
    p_stock_status,
    p_observed_on,
    p_contributor_name,
    p_note,
    p_attribute_slugs
  );
$$;

revoke all on function public.submit_price_record_session_v3(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;
grant execute on function public.submit_price_record_session_v3(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;

comment on function public.submit_price_record_session_v3(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) is
  'Registers a canonical-card price for an approved shop id. Returns -5 when the shop does not exist.';

-- Keep postgres active so Supabase CLI can record this migration after the
-- file finishes. The CLI connection is discarded after the push completes.
