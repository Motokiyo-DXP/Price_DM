-- Search normalization, alternate card readings, and short-lived shared-PIN
-- sessions. Raw PINs and session tokens are never stored.

alter table public.cards
  add column if not exists aliases text[] not null default '{}'::text[];

alter table public.cards
  add column if not exists aliases_kana text[] not null default '{}'::text[];

create or replace function public.normalize_card_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        coalesce(p_value, ''),
        'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
        'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ'
      ),
      '[[:space:]・･·]',
      '',
      'g'
    )
  );
$$;

comment on function public.normalize_card_search(text) is
  'Normalizes card-search text by folding katakana to hiragana and removing spaces and middle dots.';

create index if not exists cards_normalized_name_trgm_idx
  on public.cards using gin (
    public.normalize_card_search(name) extensions.gin_trgm_ops
  );

create index if not exists cards_normalized_name_kana_trgm_idx
  on public.cards using gin (
    public.normalize_card_search(name_kana) extensions.gin_trgm_ops
  );

drop function if exists public.search_cards(text, text, integer);

create function public.search_cards(
  p_query text default '',
  p_game_slug text default null,
  p_limit integer default 30,
  p_mode text default 'broad'
)
returns table(
  id bigint,
  game_slug text,
  game_name text,
  name text,
  name_kana text,
  card_number text,
  product_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as (
    select
      public.normalize_card_search(p_query) as normalized_query,
      case when p_mode = 'precise' then 0.90::real else 0.60::real end as threshold
  ),
  ranked as (
    select
      c.id,
      g.slug as game_slug,
      g.name as game_name,
      c.name,
      c.name_kana,
      c.card_number,
      c.product_name,
      input.normalized_query,
      greatest(
        extensions.similarity(
          public.normalize_card_search(c.name),
          input.normalized_query
        ),
        extensions.similarity(
          public.normalize_card_search(c.name_kana),
          input.normalized_query
        ),
        coalesce((
          select max(extensions.similarity(
            public.normalize_card_search(alias_name),
            input.normalized_query
          ))
          from unnest(c.aliases || c.aliases_kana) as alias_name
        ), 0::real)
      ) as match_score,
      (
        public.normalize_card_search(c.name) = input.normalized_query
        or public.normalize_card_search(c.name_kana) = input.normalized_query
        or exists (
          select 1
          from unnest(c.aliases || c.aliases_kana) as alias_name
          where public.normalize_card_search(alias_name) = input.normalized_query
        )
      ) as is_exact,
      (
        public.normalize_card_search(c.name) like input.normalized_query || '%'
        or public.normalize_card_search(c.name_kana) like input.normalized_query || '%'
        or exists (
          select 1
          from unnest(c.aliases || c.aliases_kana) as alias_name
          where public.normalize_card_search(alias_name) like input.normalized_query || '%'
        )
      ) as is_prefix,
      input.threshold
    from public.cards as c
    join public.tcg_games as g on g.id = c.game_id
    cross join search_input as input
    where p_game_slug is null or g.slug = p_game_slug
  )
  select
    ranked.id,
    ranked.game_slug,
    ranked.game_name,
    ranked.name,
    ranked.name_kana,
    ranked.card_number,
    ranked.product_name
  from ranked
  where
    ranked.normalized_query = ''
    or ranked.is_exact
    or ranked.is_prefix
    or public.normalize_card_search(ranked.name)
      like '%' || ranked.normalized_query || '%'
    or public.normalize_card_search(ranked.name_kana)
      like '%' || ranked.normalized_query || '%'
    or exists (
      select 1
      from unnest(
        (select cards.aliases || cards.aliases_kana
         from public.cards as cards
         where cards.id = ranked.id)
      ) as alias_name
      where public.normalize_card_search(alias_name)
        like '%' || ranked.normalized_query || '%'
    )
    or coalesce(ranked.card_number, '') ilike '%' || trim(p_query) || '%'
    or coalesce(ranked.product_name, '') ilike '%' || trim(p_query) || '%'
    or ranked.match_score >= ranked.threshold
  order by
    ranked.is_exact desc,
    ranked.is_prefix desc,
    ranked.match_score desc,
    ranked.name,
    ranked.card_number nulls last
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.search_cards(text, text, integer, text)
  from public;
grant execute on function public.search_cards(text, text, integer, text)
  to anon, authenticated;

-- Known official alternate reading. Additional special readings are appended
-- by the official-card import as they are verified.
update public.cards
set aliases = array(
  select distinct value
  from unnest(aliases || array['パーフェクト・アルカディア']) as value
)
where name = '理想と平和の決断';

create table private.registration_sessions (
  token_hash bytea primary key
    check (pg_catalog.octet_length(token_hash) = 32),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default pg_catalog.now(),
  usage_window_started_at timestamptz not null default pg_catalog.now(),
  usage_count integer not null default 0 check (usage_count >= 0)
);

alter table private.registration_sessions enable row level security;
alter table private.registration_sessions force row level security;

create index registration_sessions_expires_at_idx
  on private.registration_sessions(expires_at);

revoke all on table private.registration_sessions
  from public, anon, authenticated, service_role, price_registration_executor;
grant select, insert, update, delete on table private.registration_sessions
  to price_registration_executor;

create policy registration_sessions_executor_all
  on private.registration_sessions
  for all
  to price_registration_executor
  using (true)
  with check (true);

grant execute on function extensions.digest(bytea, text)
  to price_registration_executor;
grant execute on function extensions.gen_random_bytes(integer)
  to price_registration_executor;

create or replace function private.verify_registration_pin_impl(p_pin text)
returns integer
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
  v_is_limited boolean;
  v_client_attempt_count integer;
  v_global_attempt_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window constant interval := interval '15 minutes';
  v_client_limit constant integer := 5;
  v_global_limit constant integer := 100;
begin
  select config.registration_pin_hash
  into v_pin_hash
  from public.app_config as config
  where config.id = true;

  if v_pin_hash is null then
    return -3;
  end if;

  select config.rate_limit_hmac_key
  into strict v_rate_limit_hmac_key
  from private.registration_security_config as config
  where config.id = true;

  v_request_headers := coalesce(
    nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_client_identifier := coalesce(
    nullif(pg_catalog.btrim(pg_catalog.split_part(
      coalesce(v_request_headers ->> 'x-forwarded-for', ''), ',', 1
    )), ''),
    nullif(pg_catalog.btrim(v_request_headers ->> 'cf-connecting-ip'), ''),
    nullif(pg_catalog.btrim(v_request_headers ->> 'x-real-ip'), ''),
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
          limits.window_started_at > v_now - v_window
          and limits.attempt_count >= v_client_limit
        )
      )
  ) into v_is_limited;
  if v_is_limited then return -2; end if;

  select exists(
    select 1
    from private.registration_rate_limits as limits
    where limits.scope = 'global'
      and limits.subject_hash = v_global_hash
      and limits.action = 'pin_failure'
      and limits.window_started_at > v_now - v_window
      and limits.attempt_count >= v_global_limit
  ) into v_is_limited;
  if v_is_limited then return -2; end if;

  if p_pin is not null
    and pg_catalog.octet_length(p_pin) <= 64
    and extensions.crypt(p_pin, v_pin_hash) = v_pin_hash then
    update private.registration_rate_limits as limits
    set attempt_count = 0,
        window_started_at = v_now,
        blocked_until = null,
        updated_at = v_now
    where limits.scope = 'client'
      and limits.subject_hash = v_client_hash
      and limits.action = 'pin_failure';
    return 1;
  end if;

  insert into private.registration_rate_limits as limits(
    scope, subject_hash, action, window_started_at, attempt_count,
    blocked_until, updated_at
  ) values (
    'global', v_global_hash, 'pin_failure', v_now, 1, null, v_now
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
  returning attempt_count into v_global_attempt_count;

  insert into private.registration_rate_limits as limits(
    scope, subject_hash, action, window_started_at, attempt_count,
    blocked_until, updated_at
  ) values (
    'client', v_client_hash, 'pin_failure', v_now, 1, null, v_now
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
      blocked_until = case
        when (
          case
            when limits.window_started_at <= v_now - v_window then 1
            else limits.attempt_count + 1
          end
        ) >= v_client_limit then v_now + v_window
        else null
      end,
      updated_at = v_now
  returning attempt_count into v_client_attempt_count;

  if v_client_attempt_count >= v_client_limit
    or v_global_attempt_count >= v_global_limit then
    return -2;
  end if;
  return -1;
end;
$$;

-- Ownership is transferred to the least-privilege executor role. Supabase's
-- migration owner only receives SET permission for the duration of this DDL.
grant price_registration_executor to postgres with set true;

revoke all on function private.verify_registration_pin_impl(text)
  from public, anon, authenticated, service_role;
alter function private.verify_registration_pin_impl(text)
  owner to price_registration_executor;

create or replace function private.create_registration_session_impl(p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pin_result integer;
  v_token text;
  v_token_hash bytea;
  v_expires_at timestamptz;
begin
  v_pin_result := private.verify_registration_pin_impl(p_pin);
  if v_pin_result = -1 then
    return pg_catalog.jsonb_build_object('status', 'invalid_pin');
  elsif v_pin_result = -2 then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  elsif v_pin_result = -3 then
    return pg_catalog.jsonb_build_object('status', 'not_configured');
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := extensions.digest(
    pg_catalog.convert_to(v_token, 'UTF8'),
    'sha256'
  );
  v_expires_at := pg_catalog.clock_timestamp() + interval '12 hours';

  delete from private.registration_sessions
  where expires_at <= pg_catalog.clock_timestamp();

  insert into private.registration_sessions(
    token_hash, expires_at
  ) values (
    v_token_hash, v_expires_at
  );

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'session_token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function private.create_registration_session_impl(text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_registration_session_impl(text)
  to anon, authenticated;
alter function private.create_registration_session_impl(text)
  owner to price_registration_executor;

create or replace function public.create_registration_session(p_pin text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.create_registration_session_impl(p_pin);
$$;

revoke all on function public.create_registration_session(text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_registration_session(text)
  to anon, authenticated;

create or replace function private.validate_registration_session_impl(
  p_session_token text
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select sessions.expires_at
  from private.registration_sessions as sessions
  where sessions.token_hash = extensions.digest(
      pg_catalog.convert_to(coalesce(p_session_token, ''), 'UTF8'),
      'sha256'
    )
    and sessions.expires_at > pg_catalog.clock_timestamp();
$$;

revoke all on function private.validate_registration_session_impl(text)
  from public, anon, authenticated, service_role;
grant execute on function private.validate_registration_session_impl(text)
  to anon, authenticated;
alter function private.validate_registration_session_impl(text)
  owner to price_registration_executor;

create or replace function public.validate_registration_session(
  p_session_token text
)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select private.validate_registration_session_impl(p_session_token);
$$;

revoke all on function public.validate_registration_session(text)
  from public, anon, authenticated, service_role;
grant execute on function public.validate_registration_session(text)
  to anon, authenticated;

create or replace function private.submit_price_record_session_impl(
  p_session_token text,
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
  v_token_hash bytea;
  v_rate_limit_hmac_key bytea;
  v_global_hash bytea;
  v_session_usage integer;
  v_global_attempt_count integer;
  v_shop_id bigint;
  v_record_id bigint;
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

  if not exists(
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
  if v_session_usage is null then return -2; end if;

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
    scope, subject_hash, action, window_started_at, attempt_count,
    blocked_until, updated_at
  ) values (
    'global', v_global_hash, 'submission', v_now, 1, null, v_now
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
  if v_global_attempt_count is null then return -2; end if;

  if not exists(
    select 1 from public.cards as cards where cards.id = p_card_id
  ) then raise exception 'card_not_found'; end if;
  if coalesce(pg_catalog.btrim(p_shop_name), '') = '' then
    raise exception 'shop_name_required';
  end if;
  if pg_catalog.char_length(p_shop_name) > 200 then
    raise exception 'shop_name_too_long';
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

  insert into public.shops(name)
  values (pg_catalog.btrim(p_shop_name))
  on conflict (name) do update set name = excluded.name
  returning id into v_shop_id;

  insert into public.price_records(
    card_id, shop_id, sale_price, buy_price, stock_status, observed_on,
    contributor_name, note
  ) values (
    p_card_id, v_shop_id, p_sale_price, p_buy_price,
    coalesce(p_stock_status, 'unknown'), coalesce(p_observed_on, current_date),
    nullif(pg_catalog.btrim(p_contributor_name), ''),
    nullif(pg_catalog.btrim(p_note), '')
  ) returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function private.submit_price_record_session_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.submit_price_record_session_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) to anon, authenticated;
alter function private.submit_price_record_session_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) owner to price_registration_executor;

revoke price_registration_executor from postgres granted by postgres;

create or replace function public.submit_price_record_session(
  p_session_token text,
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
  select private.submit_price_record_session_impl(
    p_session_token, p_card_id, p_shop_name, p_sale_price, p_buy_price,
    p_stock_status, p_observed_on, p_contributor_name, p_note
  );
$$;

revoke all on function public.submit_price_record_session(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_price_record_session(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) to anon, authenticated;

comment on function public.create_registration_session(text) is
  'Verifies the shared PIN and returns a one-time-visible opaque token valid for 12 hours.';
comment on function public.submit_price_record_session(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) is
  'Registers a price using a short-lived opaque session token. Returns -2 for rate limit and -4 for an invalid or expired session.';

