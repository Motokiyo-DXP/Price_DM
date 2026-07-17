-- Shared-PIN registration security.
-- PIN values and hashes are intentionally excluded from migrations. Configure
-- the PIN once through an administrator-only operation after deployment.

create schema if not exists private authorization postgres;

revoke all on schema private from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'price_registration_executor'
  ) then
    create role price_registration_executor
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end;
$$;

grant usage on schema public, extensions to price_registration_executor;
grant usage, create on schema private to price_registration_executor;
grant usage on schema private to anon, authenticated;

grant execute on function extensions.crypt(text, text)
  to price_registration_executor;
grant execute on function extensions.hmac(bytea, bytea, text)
  to price_registration_executor;

create table private.registration_security_config (
  id boolean primary key default true check (id),
  rate_limit_hmac_key bytea not null
    check (pg_catalog.octet_length(rate_limit_hmac_key) = 32),
  created_at timestamptz not null default pg_catalog.now()
);

alter table private.registration_security_config enable row level security;
alter table private.registration_security_config force row level security;

insert into private.registration_security_config(id, rate_limit_hmac_key)
values (true, extensions.gen_random_bytes(32))
on conflict (id) do nothing;

create table private.registration_rate_limits (
  scope text not null
    check (scope in ('client', 'global')),
  subject_hash bytea not null
    check (pg_catalog.octet_length(subject_hash) = 32),
  action text not null
    check (action in ('pin_failure', 'submission')),
  window_started_at timestamptz not null,
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (scope, subject_hash, action)
);

alter table private.registration_rate_limits enable row level security;
alter table private.registration_rate_limits force row level security;

create index registration_rate_limits_updated_at_idx
  on private.registration_rate_limits(updated_at);

comment on column private.registration_rate_limits.subject_hash is
  'HMAC-SHA256 of the request client identifier; raw IP addresses are never stored.';

revoke all on table private.registration_security_config
  from public, anon, authenticated, service_role, price_registration_executor;
revoke all on table private.registration_rate_limits
  from public, anon, authenticated, service_role, price_registration_executor;

grant select on table private.registration_security_config
  to price_registration_executor;
grant select, insert, update, delete on table private.registration_rate_limits
  to price_registration_executor;

create policy registration_security_config_executor_select
  on private.registration_security_config
  for select
  to price_registration_executor
  using (id);

create policy registration_rate_limits_executor_all
  on private.registration_rate_limits
  for all
  to price_registration_executor
  using (true)
  with check (true);

grant select (id, registration_pin_hash)
  on table public.app_config
  to price_registration_executor;
grant select (id)
  on table public.cards
  to price_registration_executor;
grant select (id, name), insert (name), update (name)
  on table public.shops
  to price_registration_executor;
grant select (id)
  on table public.price_records
  to price_registration_executor;
grant insert (
  card_id,
  shop_id,
  sale_price,
  buy_price,
  stock_status,
  observed_on,
  contributor_name,
  note
)
  on table public.price_records
  to price_registration_executor;
grant usage, select on sequence public.shops_id_seq
  to price_registration_executor;
grant usage, select on sequence public.price_records_id_seq
  to price_registration_executor;

create policy registration_executor_read_app_config
  on public.app_config
  for select
  to price_registration_executor
  using (id);

create policy registration_executor_read_cards
  on public.cards
  for select
  to price_registration_executor
  using (true);

create policy registration_executor_read_shops
  on public.shops
  for select
  to price_registration_executor
  using (true);

create policy registration_executor_insert_shops
  on public.shops
  for insert
  to price_registration_executor
  with check (true);

create policy registration_executor_update_shops
  on public.shops
  for update
  to price_registration_executor
  using (true)
  with check (true);

create policy registration_executor_read_price_records
  on public.price_records
  for select
  to price_registration_executor
  using (true);

create policy registration_executor_insert_price_records
  on public.price_records
  for insert
  to price_registration_executor
  with check (true);

-- Create only an empty placeholder for new environments. Never overwrite a
-- PIN hash that an administrator has already configured.
insert into public.app_config(id)
values (true)
on conflict (id) do nothing;

create or replace function private.submit_price_record_impl(
  p_pin text,
  p_card_id bigint,
  p_shop_name text,
  p_sale_price integer default null,
  p_buy_price integer default null,
  p_stock_status public.stock_status default 'unknown',
  p_observed_on date default current_date,
  p_contributor_name text default null,
  p_note text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pin_hash text;
  v_rate_limit_hmac_key bytea;
  v_request_headers jsonb;
  v_client_identifier text;
  v_client_hash bytea;
  v_global_hash bytea;
  v_pin_valid boolean := false;
  v_is_limited boolean;
  v_client_attempt_count integer;
  v_global_attempt_count integer;
  v_shop_id bigint;
  v_record_id bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_pin_window constant interval := interval '15 minutes';
  v_submission_window constant interval := interval '1 hour';
  v_pin_failure_limit constant integer := 5;
  v_global_pin_failure_limit constant integer := 100;
  v_client_submission_limit constant integer := 20;
  v_global_submission_limit constant integer := 200;
begin
  select c.registration_pin_hash
  into v_pin_hash
  from public.app_config as c
  where c.id = true;

  if v_pin_hash is null then
    return -3;
  end if;

  select c.rate_limit_hmac_key
  into strict v_rate_limit_hmac_key
  from private.registration_security_config as c
  where c.id = true;

  v_request_headers := coalesce(
    nullif(
      pg_catalog.current_setting('request.headers', true),
      ''
    )::jsonb,
    '{}'::jsonb
  );

  v_client_identifier := coalesce(
    nullif(
      pg_catalog.btrim(
        pg_catalog.split_part(
          coalesce(v_request_headers ->> 'x-forwarded-for', ''),
          ',',
          1
        )
      ),
      ''
    ),
    nullif(
      pg_catalog.btrim(v_request_headers ->> 'cf-connecting-ip'),
      ''
    ),
    nullif(
      pg_catalog.btrim(v_request_headers ->> 'x-real-ip'),
      ''
    ),
    'unknown'
  );

  v_client_hash := extensions.hmac(
    pg_catalog.convert_to(v_client_identifier, 'UTF8'),
    v_rate_limit_hmac_key,
    'sha256'
  );
  v_global_hash := extensions.hmac(
    pg_catalog.convert_to('global', 'UTF8'),
    v_rate_limit_hmac_key,
    'sha256'
  );

  select exists(
    select 1
    from private.registration_rate_limits as limits
    where limits.scope = 'client'
      and limits.subject_hash = v_client_hash
      and limits.action = 'pin_failure'
      and (
        limits.blocked_until > v_now
        or (
          limits.window_started_at > v_now - v_pin_window
          and limits.attempt_count >= v_pin_failure_limit
        )
      )
  )
  into v_is_limited;

  if v_is_limited then
    return -2;
  end if;

  select exists(
    select 1
    from private.registration_rate_limits as limits
    where limits.scope = 'global'
      and limits.subject_hash = v_global_hash
      and limits.action = 'pin_failure'
      and limits.window_started_at > v_now - v_pin_window
      and limits.attempt_count >= v_global_pin_failure_limit
  )
  into v_is_limited;

  if v_is_limited then
    return -2;
  end if;

  if p_pin is not null and pg_catalog.octet_length(p_pin) <= 64 then
    v_pin_valid := extensions.crypt(p_pin, v_pin_hash) = v_pin_hash;
  end if;

  if not v_pin_valid then
    insert into private.registration_rate_limits as limits(
      scope,
      subject_hash,
      action,
      window_started_at,
      attempt_count,
      blocked_until,
      updated_at
    )
    values (
      'global',
      v_global_hash,
      'pin_failure',
      v_now,
      1,
      null,
      v_now
    )
    on conflict (scope, subject_hash, action) do update
    set window_started_at = case
          when limits.window_started_at <= v_now - v_pin_window then v_now
          else limits.window_started_at
        end,
        attempt_count = case
          when limits.window_started_at <= v_now - v_pin_window then 1
          else limits.attempt_count + 1
        end,
        blocked_until = null,
        updated_at = v_now
    returning attempt_count into v_global_attempt_count;

    insert into private.registration_rate_limits as limits(
      scope,
      subject_hash,
      action,
      window_started_at,
      attempt_count,
      blocked_until,
      updated_at
    )
    values (
      'client',
      v_client_hash,
      'pin_failure',
      v_now,
      1,
      null,
      v_now
    )
    on conflict (scope, subject_hash, action) do update
    set window_started_at = case
          when limits.window_started_at <= v_now - v_pin_window then v_now
          else limits.window_started_at
        end,
        attempt_count = case
          when limits.window_started_at <= v_now - v_pin_window then 1
          else limits.attempt_count + 1
        end,
        blocked_until = case
          when (
            case
              when limits.window_started_at <= v_now - v_pin_window then 1
              else limits.attempt_count + 1
            end
          ) >= v_pin_failure_limit
          then v_now + v_pin_window
          else null
        end,
        updated_at = v_now
    returning attempt_count into v_client_attempt_count;

    if v_client_attempt_count >= v_pin_failure_limit
      or v_global_attempt_count >= v_global_pin_failure_limit then
      return -2;
    end if;

    return -1;
  end if;

  update private.registration_rate_limits as limits
  set attempt_count = 0,
      window_started_at = v_now,
      blocked_until = null,
      updated_at = v_now
  where limits.scope = 'client'
    and limits.subject_hash = v_client_hash
    and limits.action = 'pin_failure';

  if not exists(
    select 1 from public.cards as cards where cards.id = p_card_id
  ) then
    raise exception 'card_not_found';
  end if;

  if coalesce(pg_catalog.btrim(p_shop_name), '') = '' then
    raise exception 'shop_name_required';
  end if;

  if pg_catalog.char_length(p_shop_name) > 200 then
    raise exception 'shop_name_too_long';
  end if;

  if p_sale_price is null and p_buy_price is null then
    raise exception 'at_least_one_price_required';
  end if;

  if coalesce(p_sale_price, 0) < 0
    or coalesce(p_buy_price, 0) < 0 then
    raise exception 'price_must_be_nonnegative';
  end if;

  if pg_catalog.char_length(coalesce(p_contributor_name, '')) > 100 then
    raise exception 'contributor_name_too_long';
  end if;

  if pg_catalog.char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'note_too_long';
  end if;

  v_client_attempt_count := null;
  insert into private.registration_rate_limits as limits(
    scope,
    subject_hash,
    action,
    window_started_at,
    attempt_count,
    blocked_until,
    updated_at
  )
  values (
    'client',
    v_client_hash,
    'submission',
    v_now,
    1,
    null,
    v_now
  )
  on conflict (scope, subject_hash, action) do update
  set window_started_at = case
        when limits.window_started_at <= v_now - v_submission_window then v_now
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= v_now - v_submission_window then 1
        else limits.attempt_count + 1
      end,
      blocked_until = null,
      updated_at = v_now
  where limits.window_started_at <= v_now - v_submission_window
     or limits.attempt_count < v_client_submission_limit
  returning attempt_count into v_client_attempt_count;

  if v_client_attempt_count is null then
    return -2;
  end if;

  v_global_attempt_count := null;
  insert into private.registration_rate_limits as limits(
    scope,
    subject_hash,
    action,
    window_started_at,
    attempt_count,
    blocked_until,
    updated_at
  )
  values (
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
        when limits.window_started_at <= v_now - v_submission_window then v_now
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.window_started_at <= v_now - v_submission_window then 1
        else limits.attempt_count + 1
      end,
      blocked_until = null,
      updated_at = v_now
  where limits.window_started_at <= v_now - v_submission_window
     or limits.attempt_count < v_global_submission_limit
  returning attempt_count into v_global_attempt_count;

  if v_global_attempt_count is null then
    return -2;
  end if;

  insert into public.shops(name)
  values (pg_catalog.btrim(p_shop_name))
  on conflict (name) do update set name = excluded.name
  returning id into v_shop_id;

  insert into public.price_records(
    card_id,
    shop_id,
    sale_price,
    buy_price,
    stock_status,
    observed_on,
    contributor_name,
    note
  )
  values (
    p_card_id,
    v_shop_id,
    p_sale_price,
    p_buy_price,
    coalesce(p_stock_status, 'unknown'),
    coalesce(p_observed_on, current_date),
    nullif(pg_catalog.btrim(p_contributor_name), ''),
    nullif(pg_catalog.btrim(p_note), '')
  )
  returning id into v_record_id;

  if pg_catalog.get_byte(v_client_hash, 0) = 0 then
    delete from private.registration_rate_limits as limits
    where limits.updated_at < v_now - interval '7 days';
  end if;

  return v_record_id;
end;
$$;

revoke all on function private.submit_price_record_impl(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function private.submit_price_record_impl(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) to anon, authenticated;

-- SET is enabled only for the ownership transfer. The explicit grant made by
-- postgres is removed immediately afterward; Supabase's creator-admin
-- membership remains NOINHERIT/SET FALSE and conveys no executor privileges.
grant price_registration_executor to postgres with set true;
alter function private.submit_price_record_impl(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) owner to price_registration_executor;
revoke price_registration_executor from postgres granted by postgres;

create or replace function public.submit_price_record(
  p_pin text,
  p_card_id bigint,
  p_shop_name text,
  p_sale_price integer default null,
  p_buy_price integer default null,
  p_stock_status public.stock_status default 'unknown',
  p_observed_on date default current_date,
  p_contributor_name text default null,
  p_note text default null
)
returns bigint
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.submit_price_record_impl(
    p_pin,
    p_card_id,
    p_shop_name,
    p_sale_price,
    p_buy_price,
    p_stock_status,
    p_observed_on,
    p_contributor_name,
    p_note
  );
$$;

revoke all on function public.submit_price_record(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_price_record(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) to anon, authenticated;

comment on function public.submit_price_record(
  text,
  bigint,
  text,
  integer,
  integer,
  public.stock_status,
  date,
  text,
  text
) is
  'Shared-PIN registration. Returns a positive record ID, -1 for invalid PIN, -2 for rate limit, or -3 when PIN is not configured.';
