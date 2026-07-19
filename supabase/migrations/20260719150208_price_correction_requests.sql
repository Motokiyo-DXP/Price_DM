-- Correction requests are append-only review records. Public callers can only
-- submit through the PIN-session RPC; only allowlisted Auth administrators can
-- approve or reject them.
create table public.price_correction_requests (
  id bigint generated always as identity primary key,
  price_record_id bigint not null references public.price_records(id) on delete restrict,
  proposed_sale_price integer,
  proposed_buy_price integer,
  proposed_stock_status public.stock_status not null,
  proposed_observed_on date not null,
  proposed_note text,
  reason text not null check (pg_catalog.length(reason) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  replacement_price_record_id bigint references public.price_records(id) on delete restrict,
  check (proposed_sale_price is not null or proposed_buy_price is not null),
  check (reviewed_at is null or status in ('approved', 'rejected')),
  check (status <> 'approved' or replacement_price_record_id is not null)
);

create unique index price_correction_requests_one_pending_per_record_idx
  on public.price_correction_requests(price_record_id)
  where status = 'pending';

create index price_correction_requests_pending_idx
  on public.price_correction_requests(submitted_at, id)
  where status = 'pending';

alter table public.price_correction_requests enable row level security;
alter table public.price_correction_requests force row level security;
revoke all on table public.price_correction_requests from public, anon, authenticated;

create or replace function private.submit_price_correction_request_impl(
  p_session_token text,
  p_price_record_id bigint,
  p_sale_price integer,
  p_buy_price integer,
  p_stock_status public.stock_status,
  p_observed_on date,
  p_note text,
  p_reason text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
  v_request_id bigint;
begin
  if p_session_token is null or pg_catalog.octet_length(p_session_token) > 128 then
    return -4;
  end if;

  select private.validate_registration_session_impl(p_session_token)
    into v_expires_at;
  if v_expires_at is null or v_expires_at <= pg_catalog.clock_timestamp() then
    return -4;
  end if;

  if p_price_record_id is null or p_price_record_id <= 0
    or p_stock_status is null or p_observed_on is null
    or (p_sale_price is null and p_buy_price is null)
    or p_sale_price < 0 or p_buy_price < 0
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0
    or pg_catalog.length(coalesce(p_reason, '')) > 2000
    or pg_catalog.length(coalesce(p_note, '')) > 2000 then
    return -1;
  end if;

  if not exists (
    select 1 from public.price_records
    where id = p_price_record_id and deleted_at is null
  ) then
    return -5;
  end if;

  insert into public.price_correction_requests(
    price_record_id, proposed_sale_price, proposed_buy_price,
    proposed_stock_status, proposed_observed_on, proposed_note, reason
  ) values (
    p_price_record_id, p_sale_price, p_buy_price,
    p_stock_status, p_observed_on, nullif(pg_catalog.btrim(p_note), ''),
    pg_catalog.btrim(p_reason)
  ) returning id into v_request_id;

  return v_request_id;
exception
  when unique_violation then return -2;
end;
$$;

revoke all on function private.submit_price_correction_request_impl(
  text, bigint, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.submit_price_correction_request_impl(
  text, bigint, integer, integer, public.stock_status, date, text, text
) to anon, authenticated;

create or replace function public.submit_price_correction_request(
  p_session_token text,
  p_price_record_id bigint,
  p_sale_price integer,
  p_buy_price integer,
  p_stock_status public.stock_status,
  p_observed_on date,
  p_note text,
  p_reason text
)
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_price_correction_request_impl(
    p_session_token, p_price_record_id, p_sale_price, p_buy_price,
    p_stock_status, p_observed_on, p_note, p_reason
  );
$$;

revoke all on function public.submit_price_correction_request(
  text, bigint, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_price_correction_request(
  text, bigint, integer, integer, public.stock_status, date, text, text
) to anon, authenticated;

create or replace function private.list_pending_price_corrections_for_admin(
  p_limit integer default 50
)
returns table (
  id bigint,
  price_record_id bigint,
  card_name text,
  shop_name text,
  original_sale_price integer,
  original_buy_price integer,
  proposed_sale_price integer,
  proposed_buy_price integer,
  proposed_stock_status public.stock_status,
  proposed_observed_on date,
  proposed_note text,
  reason text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_user();
  return query
  select
    requests.id, requests.price_record_id, cards.name, shops.name,
    records.sale_price, records.buy_price,
    requests.proposed_sale_price, requests.proposed_buy_price,
    requests.proposed_stock_status, requests.proposed_observed_on,
    requests.proposed_note, requests.reason, requests.submitted_at
  from public.price_correction_requests as requests
  join public.price_records as records on records.id = requests.price_record_id
  join public.canonical_cards as cards on cards.id = records.canonical_card_id
  join public.shops as shops on shops.id = records.shop_id
  where requests.status = 'pending'
  order by requests.submitted_at asc, requests.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function private.review_price_correction_for_admin(
  p_request_id bigint,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_request public.price_correction_requests%rowtype;
  v_original public.price_records%rowtype;
  v_replacement_id bigint;
begin
  v_admin_user_id := private.require_admin_user();
  select * into v_request from public.price_correction_requests
  where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'correction_not_pending' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid_decision' using errcode = '22023'; end if;

  if p_decision = 'approved' then
    select * into v_original from public.price_records
    where id = v_request.price_record_id and deleted_at is null for update;
    if not found then raise exception 'price_record_unavailable' using errcode = 'P0001'; end if;
    insert into public.price_records(
      card_id, canonical_card_id, card_print_id, shop_id, sale_price, buy_price,
      stock_status, observed_on, contributor_name, note
    ) values (
      v_original.card_id, v_original.canonical_card_id, v_original.card_print_id,
      v_original.shop_id, v_request.proposed_sale_price, v_request.proposed_buy_price,
      v_request.proposed_stock_status, v_request.proposed_observed_on,
      v_original.contributor_name, coalesce(v_request.proposed_note, v_original.note)
    ) returning id into v_replacement_id;
    insert into public.price_record_attributes(price_record_id, price_attribute_id)
    select v_replacement_id, price_attribute_id
    from public.price_record_attributes where price_record_id = v_original.id;
    update public.price_records set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_original.id;
    update public.price_correction_requests set
      status = 'approved', reviewed_at = pg_catalog.now(), reviewed_by = v_admin_user_id,
      review_note = nullif(pg_catalog.btrim(p_review_note), ''),
      replacement_price_record_id = v_replacement_id
    where id = v_request.id;
  else
    update public.price_correction_requests set
      status = 'rejected', reviewed_at = pg_catalog.now(), reviewed_by = v_admin_user_id,
      review_note = nullif(pg_catalog.btrim(p_review_note), '')
    where id = v_request.id;
  end if;
end;
$$;

revoke all on function private.list_pending_price_corrections_for_admin(integer) from public, anon, authenticated, service_role;
revoke all on function private.review_price_correction_for_admin(bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function private.list_pending_price_corrections_for_admin(integer) to authenticated;
grant execute on function private.review_price_correction_for_admin(bigint, text, text) to authenticated;

create or replace function public.list_pending_price_corrections_for_admin(p_limit integer default 50)
returns table (
  id bigint, price_record_id bigint, card_name text, shop_name text,
  original_sale_price integer, original_buy_price integer,
  proposed_sale_price integer, proposed_buy_price integer,
  proposed_stock_status public.stock_status, proposed_observed_on date,
  proposed_note text, reason text, submitted_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.list_pending_price_corrections_for_admin(p_limit); $$;

create or replace function public.review_price_correction_for_admin(
  p_request_id bigint, p_decision text, p_review_note text default null
)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.review_price_correction_for_admin(p_request_id, p_decision, p_review_note); $$;

revoke all on function public.list_pending_price_corrections_for_admin(integer) from public, anon, authenticated, service_role;
revoke all on function public.review_price_correction_for_admin(bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.list_pending_price_corrections_for_admin(integer) to authenticated;
grant execute on function public.review_price_correction_for_admin(bigint, text, text) to authenticated;
