alter table public.profiles add column if not exists avatar_url text;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 1000);
exception when duplicate_object then null; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-icons','profile-icons',true,131072,array['image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists profile_icons_owner_insert on storage.objects;
create policy profile_icons_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='profile-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists profile_icons_owner_select on storage.objects;
create policy profile_icons_owner_select on storage.objects for select to authenticated
using (bucket_id='profile-icons' and owner_id=(select auth.uid())::text);
drop policy if exists profile_icons_owner_update on storage.objects;
create policy profile_icons_owner_update on storage.objects for update to authenticated
using (bucket_id='profile-icons' and owner_id=(select auth.uid())::text)
with check (bucket_id='profile-icons' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists profile_icons_owner_delete on storage.objects;
create policy profile_icons_owner_delete on storage.objects for delete to authenticated
using (bucket_id='profile-icons' and owner_id=(select auth.uid())::text);

create or replace function private.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_name text; v_requested_name text:=pg_catalog.btrim(new.raw_user_meta_data->>'display_name');
begin
  v_name:=case when pg_catalog.char_length(v_requested_name) between 1 and 30 then v_requested_name else 'user-'||pg_catalog.left(pg_catalog.replace(new.id::text,'-',''),8) end;
  insert into public.profiles(user_id,display_name) values(new.id,v_name) on conflict(user_id) do nothing;
  return new;
end;
$$;

drop function if exists public.list_online_lobby_members(uuid);
create function public.list_online_lobby_members(p_lobby_id uuid)
returns table(user_id uuid,display_name text,avatar_url text,member_role text,last_seen_at timestamptz,is_online boolean)
language plpgsql stable security definer set search_path=''
as $$
declare v_user_id uuid:=(select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.online_lobbies l where l.id=p_lobby_id and (l.kind='public' or exists(select 1 from public.online_lobby_members m where m.lobby_id=p_lobby_id and m.user_id=v_user_id))) then raise exception 'lobby_access_denied' using errcode='42501'; end if;
  return query select m.user_id,p.display_name,p.avatar_url,m.member_role,m.last_seen_at,m.last_seen_at>=pg_catalog.now()-interval '30 seconds'
  from public.online_lobby_members m join public.profiles p on p.user_id=m.user_id where m.lobby_id=p_lobby_id order by (m.member_role='owner') desc,m.joined_at;
end;
$$;
revoke all on function public.list_online_lobby_members(uuid) from public,anon;
grant execute on function public.list_online_lobby_members(uuid) to authenticated;

drop function if exists public.list_online_match_slots(uuid);
create function public.list_online_match_slots(p_lobby_id uuid)
returns table(id uuid,slot_number smallint,format text,time_limit_minutes smallint,game_room_id uuid,status text,player_count integer,spectator_count bigint,host_display_name text,host_avatar_url text,guest_display_name text,guest_avatar_url text)
language plpgsql stable security definer set search_path=''
as $$
declare v_user_id uuid:=(select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.online_lobbies l where l.id=p_lobby_id and (l.kind='public' or exists(select 1 from public.online_lobby_members m where m.lobby_id=p_lobby_id and m.user_id=v_user_id))) then raise exception 'lobby_access_denied' using errcode='42501'; end if;
  return query select s.id,s.slot_number,s.format,s.time_limit_minutes,s.game_room_id,coalesce(r.status,'empty'),
    case when r.id is null then 0 when r.guest_user_id is null then 1 else 2 end,
    pg_catalog.count(gs.user_id),hp.display_name,hp.avatar_url,gp.display_name,gp.avatar_url
  from public.online_match_slots s
  left join public.game_rooms r on r.id=s.game_room_id
  left join public.profiles hp on hp.user_id=r.host_user_id
  left join public.profiles gp on gp.user_id=r.guest_user_id
  left join public.game_room_spectators gs on gs.room_id=r.id
  where s.lobby_id=p_lobby_id
  group by s.id,r.id,r.status,r.guest_user_id,hp.display_name,hp.avatar_url,gp.display_name,gp.avatar_url order by s.slot_number;
end;
$$;
revoke all on function public.list_online_match_slots(uuid) from public,anon;
grant execute on function public.list_online_match_slots(uuid) to authenticated;
