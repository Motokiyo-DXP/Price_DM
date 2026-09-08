create unique index online_lobby_invitations_pending_unique_idx
  on public.online_lobby_invitations(lobby_id, invitee_user_id)
  where accepted_at is null and dismissed_at is null;

create or replace function public.send_online_lobby_invitation_by_name(
  p_lobby_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitee_user_id uuid;
  v_match_count integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobby_members
    where lobby_id = p_lobby_id and user_id = v_user_id
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;

  select pg_catalog.count(*)
  into v_match_count
  from public.profiles
  where pg_catalog.lower(pg_catalog.btrim(profiles.display_name))
    = pg_catalog.lower(pg_catalog.btrim(p_display_name))
    and profiles.user_id <> v_user_id;

  if v_match_count = 0 then raise exception 'invitee_not_found' using errcode = 'P0002'; end if;
  if v_match_count > 1 then raise exception 'invitee_name_ambiguous' using errcode = '21000'; end if;
  select profiles.user_id into v_invitee_user_id
  from public.profiles
  where pg_catalog.lower(pg_catalog.btrim(profiles.display_name))
    = pg_catalog.lower(pg_catalog.btrim(p_display_name))
    and profiles.user_id <> v_user_id;

  insert into public.online_lobby_invitations(lobby_id, inviter_user_id, invitee_user_id)
  values (p_lobby_id, v_user_id, v_invitee_user_id)
  on conflict (lobby_id, invitee_user_id)
    where accepted_at is null and dismissed_at is null
  do update set inviter_user_id = excluded.inviter_user_id, created_at = pg_catalog.now();
end;
$$;

revoke all on function public.send_online_lobby_invitation_by_name(uuid, text) from public, anon;
grant execute on function public.send_online_lobby_invitation_by_name(uuid, text) to authenticated;
