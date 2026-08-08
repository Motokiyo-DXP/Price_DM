-- Register canonical cards directly. The previous v3 implementation delegated
-- to the legacy-card function, which rejected canonical imports without a
-- legacy_card_id even though price_records.card_id is intentionally nullable.

grant insert (canonical_card_id, card_print_id)
  on public.price_records to price_registration_executor;

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
  v_token_hash bytea;
  v_rate_limit_hmac_key bytea;
  v_global_hash bytea;
  v_session_usage integer;
  v_global_attempt_count integer;
  v_record_id bigint;
  v_requested_attribute_count integer;
  v_found_attribute_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window constant interval := interval '1 hour';
  v_session_limit constant integer := 20;
  v_global_limit constant integer := 200;
begin
  if p_session_token is null or pg_catalog.octet_length(p_session_token) > 128 then
    return -4;
  end if;

  v_token_hash := extensions.digest(
    pg_catalog.convert_to(p_session_token, 'UTF8'),
    'sha256'
  );

  if not exists (
    select 1
    from private.registration_sessions as sessions
    where sessions.token_hash = v_token_hash
      and sessions.expires_at > v_now
  ) then
    return -4;
  end if;

  update private.registration_sessions as sessions
  set usage_window_started_at = case
        when sessions.usage_window_started_at <= v_now - v_window then v_now
        else sessions.usage_window_started_at
      end,
      usage_count = case
        when sessions.usage_window_started_at <= v_now - v_window then 1
        else sessions.usage_count + 1
      end,
      last_used_at = v_now
  where sessions.token_hash = v_token_hash
    and sessions.expires_at > v_now
    and (
      sessions.usage_window_started_at <= v_now - v_window
      or sessions.usage_count < v_session_limit
    )
  returning usage_count into v_session_usage;

  if v_session_usage is null then
    return -2;
  end if;

  select config.rate_limit_hmac_key
  into strict v_rate_limit_hmac_key
  from private.registration_security_config as config
  where config.id = true;

  v_global_hash := extensions.hmac(
    pg_catalog.convert_to('global', 'UTF8'),
    v_rate_limit_hmac_key,
    'sha256'
  );

  insert into private.registration_rate_limits as limits(
    scope,
    subject_hash,
    action,
    window_started_at,
    attempt_count,
    blocked_until,
    updated_at
  ) values (
    'global',
    v_global_hash,
    'submission',
    v_now,
    1,
    null,
    v_now
  )
  on conflict (scope, subject_hash, action) do update
  set window_started_at = case
        when limits.window_started_at <= v_now - v_window then v_now
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= v_now - v_window then 1
        else limits.attempt_count + 1
      end,
      blocked_until = null,
      updated_at = v_now
  where limits.window_started_at <= v_now - v_window
     or limits.attempt_count < v_global_limit
  returning attempt_count into v_global_attempt_count;

  if v_global_attempt_count is null then
    return -2;
  end if;

  if not exists (
    select 1
    from public.canonical_cards as canonical
    where canonical.id = p_canonical_card_id
      and canonical.deleted_at is null
  ) then
    raise exception 'canonical_card_not_found';
  end if;

  if p_card_print_id is not null and not exists (
    select 1
    from public.card_prints as prints
    where prints.id = p_card_print_id
      and prints.canonical_card_id = p_canonical_card_id
      and prints.deleted_at is null
  ) then
    raise exception 'card_print_not_found_or_mismatch';
  end if;

  if not exists (
    select 1 from public.shops as shops where shops.id = p_shop_id
  ) then
    return -5;
  end if;

  if p_sale_price is null and p_buy_price is null then
    raise exception 'at_least_one_price_required';
  end if;
  if coalesce(p_sale_price, 0) < 0 or coalesce(p_buy_price, 0) < 0 then
    raise exception 'price_must_be_nonnegative';
  end if;
  if pg_catalog.char_length(coalesce(p_contributor_name, '')) > 100 then
    raise exception 'contributor_name_too_long';
  end if;
  if pg_catalog.char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'note_too_long';
  end if;

  select count(distinct slug_value)::integer
  into v_requested_attribute_count
  from unnest(coalesce(p_attribute_slugs, '{}'::text[])) as slug_value
  where pg_catalog.btrim(slug_value) <> '';

  select count(distinct attributes.slug)::integer
  into v_found_attribute_count
  from public.price_attributes as attributes
  where attributes.slug = any(coalesce(p_attribute_slugs, '{}'::text[]))
    and attributes.deleted_at is null
    and attributes.approval_status = 'approved';

  if v_requested_attribute_count <> v_found_attribute_count then
    raise exception 'invalid_price_attribute';
  end if;

  insert into public.price_records(
    canonical_card_id,
    card_print_id,
    shop_id,
    sale_price,
    buy_price,
    stock_status,
    observed_on,
    contributor_name,
    note
  ) values (
    p_canonical_card_id,
    p_card_print_id,
    p_shop_id,
    p_sale_price,
    p_buy_price,
    coalesce(p_stock_status, 'unknown'),
    coalesce(p_observed_on, current_date),
    nullif(pg_catalog.btrim(p_contributor_name), ''),
    nullif(pg_catalog.btrim(p_note), '')
  )
  returning id into v_record_id;

  insert into public.price_record_attributes(price_record_id, attribute_id)
  select v_record_id, selected.attribute_id
  from (
    select attributes.id as attribute_id
    from public.price_attributes as attributes
    where attributes.slug = any(coalesce(p_attribute_slugs, '{}'::text[]))
      and attributes.deleted_at is null
      and attributes.approval_status = 'approved'
    union
    select implications.implied_attribute_id
    from public.price_attributes as attributes
    join public.price_attribute_implications as implications
      on implications.attribute_id = attributes.id
    where attributes.slug = any(coalesce(p_attribute_slugs, '{}'::text[]))
      and attributes.deleted_at is null
      and attributes.approval_status = 'approved'
  ) as selected
  on conflict do nothing;

  return v_record_id;
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

comment on function private.submit_price_record_session_v3_impl(
  text, bigint, bigint, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) is
  'Registers canonical-card prices directly while preserving PIN session and rate limits.';

set role postgres;
revoke price_registration_executor from postgres granted by postgres;
