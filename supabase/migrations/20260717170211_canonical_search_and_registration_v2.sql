-- Canonical-card search and registration. A NULL card_print_id means that the
-- contributor intentionally did not specify a print/version.

create or replace function private.resolve_price_record_card_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical_card_id bigint;
  v_print_id bigint;
  v_legacy_card_id bigint;
begin
  if new.card_print_id is not null then
    select prints.canonical_card_id, prints.id, prints.legacy_card_id
    into v_canonical_card_id, v_print_id, v_legacy_card_id
    from public.card_prints as prints
    where prints.id = new.card_print_id
      and prints.deleted_at is null;

    if v_print_id is null then
      raise exception 'card_print_not_found';
    end if;
    if new.canonical_card_id is not null
      and new.canonical_card_id <> v_canonical_card_id then
      raise exception 'card_print_mismatch';
    end if;

    new.canonical_card_id := v_canonical_card_id;
    new.card_id := v_legacy_card_id;
  elsif new.canonical_card_id is null and new.card_id is not null then
    select prints.canonical_card_id, prints.id
    into v_canonical_card_id, v_print_id
    from public.card_prints as prints
    where prints.legacy_card_id = new.card_id
      and prints.deleted_at is null;

    if v_canonical_card_id is null then
      raise exception 'card_identity_not_found';
    end if;

    new.canonical_card_id := v_canonical_card_id;
    new.card_print_id := v_print_id;
  end if;

  if new.canonical_card_id is null then
    raise exception 'canonical_card_required';
  end if;

  return new;
end;
$$;

revoke all on function private.resolve_price_record_card_identity()
  from public, anon, authenticated, service_role;

drop trigger if exists resolve_price_record_card_identity
  on public.price_records;
create trigger resolve_price_record_card_identity
before insert or update of card_id, canonical_card_id, card_print_id
on public.price_records
for each row execute function private.resolve_price_record_card_identity();

create or replace function public.search_canonical_cards(
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
  print_count integer
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
      canonical.id,
      games.slug as game_slug,
      games.name as game_name,
      canonical.name,
      canonical.name_kana,
      input.normalized_query,
      coalesce(matches.match_score, 0::real) as match_score,
      coalesce(matches.is_exact, false) as is_exact,
      coalesce(matches.is_prefix, false) as is_prefix,
      coalesce(matches.is_contains, false) as is_contains,
      coalesce(prints.print_count, 0)::integer as print_count,
      coalesce(prints.print_match, false) as print_match,
      input.threshold
    from public.canonical_cards as canonical
    join public.tcg_games as games on games.id = canonical.game_id
    cross join search_input as input
    left join lateral (
      select
        max(extensions.similarity(terms.normalized_term, input.normalized_query)) as match_score,
        bool_or(terms.normalized_term = input.normalized_query) as is_exact,
        bool_or(terms.normalized_term like input.normalized_query || '%') as is_prefix,
        bool_or(terms.normalized_term like '%' || input.normalized_query || '%') as is_contains
      from public.card_search_terms as terms
      where terms.canonical_card_id = canonical.id
    ) as matches on true
    left join lateral (
      select
        count(*)::integer as print_count,
        bool_or(
          coalesce(card_prints.card_number, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
          or coalesce(card_prints.product_name, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
        ) as print_match
      from public.card_prints
      where card_prints.canonical_card_id = canonical.id
        and card_prints.deleted_at is null
    ) as prints on true
    where canonical.deleted_at is null
      and (p_game_slug is null or games.slug = p_game_slug)
  )
  select
    ranked.id,
    ranked.game_slug,
    ranked.game_name,
    ranked.name,
    ranked.name_kana,
    ranked.print_count
  from ranked
  where ranked.normalized_query = ''
    or ranked.is_exact
    or ranked.is_prefix
    or ranked.is_contains
    or ranked.print_match
    or ranked.match_score >= ranked.threshold
  order by
    ranked.is_exact desc,
    ranked.is_prefix desc,
    ranked.is_contains desc,
    ranked.match_score desc,
    ranked.name
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.search_canonical_cards(text, text, integer, text)
  from public;
grant execute on function public.search_canonical_cards(text, text, integer, text)
  to anon, authenticated;

create or replace function public.list_card_prints(p_canonical_card_id bigint)
returns table(
  id bigint,
  card_number text,
  product_name text,
  official_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select prints.id, prints.card_number, prints.product_name, prints.official_url
  from public.card_prints as prints
  where prints.canonical_card_id = p_canonical_card_id
    and prints.deleted_at is null
  order by prints.product_name nulls last, prints.card_number nulls last, prints.id;
$$;

revoke all on function public.list_card_prints(bigint) from public;
grant execute on function public.list_card_prints(bigint) to anon, authenticated;

grant select (id, game_id) on public.canonical_cards
  to price_registration_executor;
grant select (id, canonical_card_id, legacy_card_id) on public.card_prints
  to price_registration_executor;
grant select (id, slug) on public.price_attributes
  to price_registration_executor;
grant select (attribute_id, implied_attribute_id)
  on public.price_attribute_implications to price_registration_executor;
grant insert (price_record_id, attribute_id)
  on public.price_record_attributes to price_registration_executor;
grant update (card_id, canonical_card_id, card_print_id, updated_at)
  on public.price_records to price_registration_executor;

create policy canonical_cards_registration_read
  on public.canonical_cards for select to price_registration_executor
  using (deleted_at is null);
create policy card_prints_registration_read
  on public.card_prints for select to price_registration_executor
  using (deleted_at is null);
create policy price_attributes_registration_read
  on public.price_attributes for select to price_registration_executor
  using (deleted_at is null and approval_status = 'approved');
create policy price_attribute_implications_registration_read
  on public.price_attribute_implications for select to price_registration_executor
  using (true);
create policy price_record_attributes_registration_insert
  on public.price_record_attributes for insert to price_registration_executor
  with check (true);
create policy price_records_registration_update
  on public.price_records for update to price_registration_executor
  using (true)
  with check (true);

create or replace function private.submit_price_record_session_v2_impl(
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
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_legacy_card_id bigint;
  v_record_id bigint;
  v_requested_attribute_count integer;
  v_found_attribute_count integer;
begin
  if not exists(
    select 1
    from public.canonical_cards as canonical
    where canonical.id = p_canonical_card_id
      and canonical.deleted_at is null
  ) then
    raise exception 'canonical_card_not_found';
  end if;

  if p_card_print_id is not null then
    select prints.legacy_card_id
    into v_legacy_card_id
    from public.card_prints as prints
    where prints.id = p_card_print_id
      and prints.canonical_card_id = p_canonical_card_id
      and prints.deleted_at is null;
    if v_legacy_card_id is null then
      raise exception 'card_print_not_found_or_mismatch';
    end if;
  else
    select prints.legacy_card_id
    into v_legacy_card_id
    from public.card_prints as prints
    where prints.canonical_card_id = p_canonical_card_id
      and prints.legacy_card_id is not null
      and prints.deleted_at is null
    order by prints.id
    limit 1;
    if v_legacy_card_id is null then
      raise exception 'canonical_card_has_no_legacy_print';
    end if;
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

  v_record_id := private.submit_price_record_session_impl(
    p_session_token,
    v_legacy_card_id,
    p_shop_name,
    p_sale_price,
    p_buy_price,
    p_stock_status,
    p_observed_on,
    p_contributor_name,
    p_note
  );

  if v_record_id <= 0 then
    return v_record_id;
  end if;

  update public.price_records
  set canonical_card_id = p_canonical_card_id,
      card_print_id = p_card_print_id,
      card_id = case when p_card_print_id is null then null else v_legacy_card_id end,
      updated_at = pg_catalog.now()
  where id = v_record_id;

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

revoke all on function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;

grant price_registration_executor to postgres with set true;
grant execute on function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;
alter function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) owner to price_registration_executor;
revoke price_registration_executor from postgres granted by postgres;

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
grant execute on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) to anon, authenticated;

comment on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) is
  'Registers a canonical-card price. NULL p_card_print_id means version unspecified.';
