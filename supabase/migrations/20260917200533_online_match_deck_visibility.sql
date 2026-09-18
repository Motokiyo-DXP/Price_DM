alter table public.game_rooms
  add column if not exists deck_is_public boolean not null default true;

revoke select on public.game_rooms from authenticated;
grant select (id,room_code,host_user_id,guest_user_id,status,format,deck_is_public,host_ready,guest_ready,state_version,
  created_at,updated_at,expires_at,time_limit_minutes,started_at,ended_at,winner_user_id,end_reason,
  host_rematch_ready,guest_rematch_ready,retired_at,retirement_reason) on public.game_rooms to authenticated;

-- Keep the existing five-argument RPC for already-loaded clients. The new
-- reception path supplies the visibility setting atomically with room entry.
create function public.enter_online_match_slot(
  p_slot_id uuid,
  p_role text,
  p_deck_id uuid,
  p_format text,
  p_time_limit_minutes smallint,
  p_deck_is_public boolean
)
returns table(game_room_id uuid, member_role text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result record;
begin
  select * into v_result
  from public.enter_online_match_slot(p_slot_id, p_role, p_deck_id, p_format, p_time_limit_minutes);

  if v_result.member_role = 'host' and p_role = 'player' then
    update public.game_rooms
    set deck_is_public = p_deck_is_public, updated_at = pg_catalog.now()
    where id = v_result.game_room_id and host_user_id = v_user_id;
  end if;

  return query select v_result.game_room_id, v_result.member_role;
end;
$$;

revoke all on function public.enter_online_match_slot(uuid, text, uuid, text, smallint, boolean) from public, anon;
grant execute on function public.enter_online_match_slot(uuid, text, uuid, text, smallint, boolean) to authenticated;

drop function if exists public.list_online_match_slots(uuid);
create function public.list_online_match_slots(p_lobby_id uuid)
returns table(id uuid,slot_number smallint,format text,time_limit_minutes smallint,game_room_id uuid,status text,player_count integer,spectator_count bigint,host_display_name text,host_avatar_url text,guest_display_name text,guest_avatar_url text,deck_is_public boolean)
language plpgsql stable security definer set search_path=''
as $$
declare v_user_id uuid:=(select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.online_lobbies l where l.id=p_lobby_id and (l.kind='public' or exists(select 1 from public.online_lobby_members m where m.lobby_id=p_lobby_id and m.user_id=v_user_id))) then raise exception 'lobby_access_denied' using errcode='42501'; end if;
  return query select s.id,s.slot_number,s.format,s.time_limit_minutes,s.game_room_id,coalesce(r.status,'empty'),
    case when r.id is null then 0 when r.guest_user_id is null then 1 else 2 end,
    pg_catalog.count(gs.user_id),hp.display_name,hp.avatar_url,gp.display_name,gp.avatar_url,coalesce(r.deck_is_public,true)
  from public.online_match_slots s
  left join public.game_rooms r on r.id=s.game_room_id
  left join public.profiles hp on hp.user_id=r.host_user_id
  left join public.profiles gp on gp.user_id=r.guest_user_id
  left join public.game_room_spectators gs on gs.room_id=r.id
  where s.lobby_id=p_lobby_id
  group by s.id,r.id,r.status,r.guest_user_id,r.deck_is_public,hp.display_name,hp.avatar_url,gp.display_name,gp.avatar_url order by s.slot_number;
end;
$$;
revoke all on function public.list_online_match_slots(uuid) from public,anon;
grant execute on function public.list_online_match_slots(uuid) to authenticated;

drop function if exists public.get_game_room_deck_labels(uuid);
create function public.get_game_room_deck_labels(p_room_id uuid)
returns table(host_name text,guest_name text,selected_deck_id uuid,host_icon_image_key text,guest_icon_image_key text)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid()); v_room public.game_rooms%rowtype;
begin
  select * into v_room from public.game_rooms where id=p_room_id;
  if not found or v_user_id is null or not (v_user_id=v_room.host_user_id or v_user_id=v_room.guest_user_id
    or exists(select 1 from public.game_room_spectators where room_id=p_room_id and user_id=v_user_id)) then
    raise exception 'room_access_denied' using errcode='42501';
  end if;
  return query select
    case when v_room.deck_is_public then v_room.host_deck_snapshot ->> 'name' else '???' end,
    case when v_room.deck_is_public then v_room.guest_deck_snapshot ->> 'name' else '???' end,
    case when v_user_id=v_room.host_user_id then nullif(v_room.host_deck_snapshot ->> 'sourceDeckId','')::uuid
         when v_user_id=v_room.guest_user_id then nullif(v_room.guest_deck_snapshot ->> 'sourceDeckId','')::uuid else null end,
    case when v_room.deck_is_public then v_room.host_deck_snapshot -> 'cards' -> 0 ->> 'imageKey' else null end,
    case when v_room.deck_is_public then v_room.guest_deck_snapshot -> 'cards' -> 0 ->> 'imageKey' else null end;
end;
$$;
revoke all on function public.get_game_room_deck_labels(uuid) from public,anon;
grant execute on function public.get_game_room_deck_labels(uuid) to authenticated;
