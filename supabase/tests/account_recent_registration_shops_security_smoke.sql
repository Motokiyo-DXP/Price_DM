begin;

do $$
declare
  v_user_a constant uuid := 'a19c8dd0-4c51-4f09-9430-000000000001';
  v_user_b constant uuid := 'a19c8dd0-4c51-4f09-9430-000000000002';
begin
  insert into auth.users(
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_user_a, 'authenticated', 'authenticated', 'recent-a@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
    (v_user_b, 'authenticated', 'authenticated', 'recent-b@example.invalid', '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

  insert into public.shops(name, operational_status) values
    ('__recent_security_test_a1', 'active'),
    ('__recent_security_test_a2', 'active'),
    ('__recent_security_test_a3', 'active'),
    ('__recent_security_test_a4', 'active'),
    ('__recent_security_test_a5', 'active'),
    ('__recent_security_test_a6', 'active'),
    ('__recent_security_test_closed', 'closed'),
    ('__recent_security_test_b1', 'active');

  insert into public.account_recent_registration_shops(user_id, shop_id, last_registered_at)
  select v_user_a, shops.id, fixture.last_used
  from (values
    ('__recent_security_test_a1', pg_catalog.now() - interval '6 minutes'),
    ('__recent_security_test_a2', pg_catalog.now() - interval '5 minutes'),
    ('__recent_security_test_a3', pg_catalog.now() - interval '4 minutes'),
    ('__recent_security_test_a4', pg_catalog.now() - interval '3 minutes'),
    ('__recent_security_test_a5', pg_catalog.now() - interval '2 minutes'),
    ('__recent_security_test_a6', pg_catalog.now() - interval '1 minute'),
    ('__recent_security_test_closed', pg_catalog.now())
  ) as fixture(name, last_used)
  join public.shops on shops.name = fixture.name;

  insert into public.account_recent_registration_shops(user_id, shop_id, last_registered_at)
  select v_user_b, shops.id, pg_catalog.now()
  from public.shops
  where shops.name = '__recent_security_test_b1';

  -- Simulate reuse of A1 via the unique-key upsert used by the registration RPC.
  insert into public.account_recent_registration_shops(user_id, shop_id, last_registered_at)
  select v_user_a, shops.id, pg_catalog.now() + interval '1 minute'
  from public.shops
  where shops.name = '__recent_security_test_a1'
  on conflict (user_id, shop_id) do update
  set last_registered_at = excluded.last_registered_at;
end;
$$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', 'a19c8dd0-4c51-4f09-9430-000000000001', true);

do $$
declare
  v_names text[];
  v_other_user_rows integer;
  v_denied boolean;
  v_shop_id bigint;
begin
  select array(select recent.name from public.list_recent_registration_shops() as recent)
  into v_names;
  if v_names is distinct from array[
    '__recent_security_test_a1',
    '__recent_security_test_a6',
    '__recent_security_test_a5',
    '__recent_security_test_a4',
    '__recent_security_test_a3'
  ]::text[] then
    raise exception 'recent shop ordering, deduplication, active filtering, or five-row limit failed: %', v_names;
  end if;

  select count(*) into v_other_user_rows
  from public.account_recent_registration_shops
  where user_id = 'a19c8dd0-4c51-4f09-9430-000000000002';
  if v_other_user_rows <> 0 then
    raise exception 'account A read account B recent shops';
  end if;

  select shops.id into v_shop_id from public.shops where shops.name = '__recent_security_test_a2';
  v_denied := false;
  begin
    insert into public.account_recent_registration_shops(user_id, shop_id)
    values ('a19c8dd0-4c51-4f09-9430-000000000001', v_shop_id);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated user inserted recent history directly'; end if;

  v_denied := false;
  begin
    update public.account_recent_registration_shops
    set last_registered_at = pg_catalog.now()
    where user_id = 'a19c8dd0-4c51-4f09-9430-000000000001';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated user updated recent history directly'; end if;

  v_denied := false;
  begin
    perform public.record_recent_registration_shop(v_shop_id);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then raise exception 'authenticated user called the standalone history writer'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', 'a19c8dd0-4c51-4f09-9430-000000000002', true);
  select array(select recent.name from public.list_recent_registration_shops() as recent)
  into v_names;
  if v_names is distinct from array['__recent_security_test_b1']::text[] then
    raise exception 'account B did not see only its own history: %', v_names;
  end if;
end;
$$;

rollback;
