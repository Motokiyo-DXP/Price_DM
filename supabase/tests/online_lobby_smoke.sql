begin;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (select auth.users.id::text from auth.users order by auth.users.created_at limit 1),
  true
);
set local role authenticated;

do $$
declare
  v_private_lobby_id uuid;
  v_public_lobby_id uuid;
  v_slot_count integer;
  v_member_count integer;
begin
  select id into v_private_lobby_id from public.create_online_lobby();
  select pg_catalog.count(*) into v_slot_count from public.list_online_match_slots(v_private_lobby_id);
  if v_slot_count <> 4 then
    raise exception 'private lobby expected 4 slots, got %', v_slot_count;
  end if;
  perform public.touch_online_lobby_presence(v_private_lobby_id);
  select pg_catalog.count(*) into v_member_count from public.list_online_lobby_members(v_private_lobby_id);
  if v_member_count <> 1 then
    raise exception 'private lobby expected 1 visible member, got %', v_member_count;
  end if;

  select id into v_public_lobby_id from public.get_public_online_lobby();
  select pg_catalog.count(*) into v_slot_count from public.list_online_match_slots(v_public_lobby_id);
  if v_slot_count <> 10 then
    raise exception 'public lobby expected 10 slots, got %', v_slot_count;
  end if;
end;
$$;

rollback;
