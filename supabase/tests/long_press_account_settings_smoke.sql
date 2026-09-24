begin;

create temporary table long_press_test_users (
  self_id uuid not null,
  other_id uuid not null
);
grant select on long_press_test_users to authenticated, anon;

do $$
declare
  v_self uuid := pg_catalog.gen_random_uuid();
  v_other uuid := pg_catalog.gen_random_uuid();
  v_default integer;
  v_nullable text;
  v_has_check boolean;
begin
  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_self, 'authenticated', 'authenticated', 'long-press-' || v_self || '@example.invalid', '{}', '{}', pg_catalog.now(), pg_catalog.now()),
    (v_other, 'authenticated', 'authenticated', 'long-press-' || v_other || '@example.invalid', '{}', '{}', pg_catalog.now(), pg_catalog.now());

  insert into long_press_test_users values (v_self, v_other);
  select profiles.long_press_ms into v_default from public.profiles profiles where profiles.user_id = v_self;
  if v_default is distinct from 400 then raise exception 'new profiles must default to 400ms'; end if;

  select columns.is_nullable into v_nullable
  from information_schema.columns columns
  where columns.table_schema = 'public' and columns.table_name = 'profiles' and columns.column_name = 'long_press_ms';
  if v_nullable is distinct from 'NO' then raise exception 'long_press_ms must be NOT NULL'; end if;

  select exists (
    select 1 from pg_catalog.pg_constraint constraints
    where constraints.conrelid = 'public.profiles'::regclass
      and constraints.conname = 'profiles_long_press_ms_check'
  ) into v_has_check;
  if not v_has_check then raise exception 'long_press_ms range constraint is missing'; end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'long_press_ms', 'UPDATE') then
    raise exception 'authenticated users need UPDATE on long_press_ms';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'long_press_ms', 'UPDATE') then
    raise exception 'anonymous users must not UPDATE long_press_ms';
  end if;
end;
$$;

set local role authenticated;
do $$
declare
  v_self uuid;
  v_other uuid;
  v_rows integer;
  v_rejected boolean := false;
  v_other_setting integer;
begin
  select users.self_id, users.other_id into v_self, v_other from long_press_test_users users;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_self::text, true);

  begin
    update public.profiles set long_press_ms = 319 where user_id = v_self;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'out-of-range values must be rejected'; end if;

  update public.profiles set long_press_ms = 520 where user_id = v_self;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'a user must be able to update their own setting'; end if;

  update public.profiles set long_press_ms = 600 where user_id = v_other;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'a user must not update another profile setting'; end if;
  select profiles.long_press_ms into v_other_setting from public.profiles profiles where profiles.user_id = v_other;
  if v_other_setting is distinct from 400 then raise exception 'another profile setting was changed'; end if;
end;
$$;

set local role anon;
do $$
declare
  v_self uuid;
  v_denied boolean := false;
begin
  select users.self_id into v_self from long_press_test_users users;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_self::text, true);
  begin
    update public.profiles set long_press_ms = 600 where user_id = v_self;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then raise exception 'anonymous users must not update long_press_ms'; end if;
end;
$$;

rollback;
