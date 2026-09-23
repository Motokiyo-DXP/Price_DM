-- Make account history a consequence of a successful, authenticated price
-- registration instead of a separately callable client-side write.

grant price_registration_executor to postgres with set true;

drop policy if exists account_recent_registration_shops_insert_own
  on public.account_recent_registration_shops;
drop policy if exists account_recent_registration_shops_update_own
  on public.account_recent_registration_shops;

revoke insert, update on table public.account_recent_registration_shops
  from anon, authenticated;
grant select on table public.account_recent_registration_shops
  to authenticated;

grant select, insert, update on table public.account_recent_registration_shops
  to price_registration_executor;
create policy account_recent_registration_shops_executor_select
  on public.account_recent_registration_shops
  for select to price_registration_executor
  using (true);
create policy account_recent_registration_shops_executor_insert
  on public.account_recent_registration_shops
  for insert to price_registration_executor
  with check (true);
create policy account_recent_registration_shops_executor_update
  on public.account_recent_registration_shops
  for update to price_registration_executor
  using (true)
  with check (true);

revoke all on function public.record_recent_registration_shop(bigint)
  from public, anon, authenticated, service_role;

set role price_registration_executor;

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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record_id bigint;
  v_jwt_sub text;
  v_jwt_claims text;
  v_user_id uuid;
begin
  v_record_id := private.submit_price_record_session_v3_impl(
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

  if v_record_id is null or v_record_id <= 0 then
    return v_record_id;
  end if;

  v_jwt_sub := nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '');
  v_jwt_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
  if v_jwt_sub is null
    and v_jwt_claims is not null
    and pg_catalog.pg_input_is_valid(v_jwt_claims, 'jsonb') then
    v_jwt_sub := v_jwt_claims::jsonb ->> 'sub';
  end if;
  if v_jwt_sub is not null
    and pg_catalog.pg_input_is_valid(v_jwt_sub, 'uuid') then
    v_user_id := v_jwt_sub::uuid;
  end if;

  if v_user_id is not null then
    begin
      insert into public.account_recent_registration_shops (
        user_id,
        shop_id,
        last_registered_at
      ) values (
        v_user_id,
        p_shop_id,
        pg_catalog.clock_timestamp()
      ) on conflict (user_id, shop_id) do update
      set last_registered_at = excluded.last_registered_at;
    exception when others then
      raise log 'Failed to update recent shop after price record %, SQLSTATE %',
        v_record_id,
        sqlstate;
    end;
  end if;

  return v_record_id;
end;
$$;

alter function public.submit_price_record_session_v3(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) owner to price_registration_executor;

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
  'Registers a canonical-card price and best-effort records the authenticated account shop only after a positive record id.';

set role postgres;
revoke price_registration_executor from postgres granted by postgres;
