begin;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (select auth.users.id::text from auth.users order by auth.users.created_at limit 1),
  true
);
set local role authenticated;

do $$
declare
  v_room_id uuid;
  v_presence_count integer;
begin
  select id into v_room_id from public.list_resumable_game_rooms() limit 1;
  if v_room_id is not null then
    perform public.touch_game_room_presence(v_room_id);
    select pg_catalog.count(*) into v_presence_count
    from public.list_game_room_presence(v_room_id);
    if v_presence_count < 1 then
      raise exception 'resumable room expected at least one visible member';
    end if;
  end if;
end;
$$;

rollback;
