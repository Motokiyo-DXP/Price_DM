create table public.user_friendships (
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  addressee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (requester_user_id, addressee_user_id),
  constraint user_friendships_distinct_users check (requester_user_id <> addressee_user_id),
  constraint user_friendships_status_check check (status in ('pending', 'accepted'))
);

create index user_friendships_addressee_idx
  on public.user_friendships(addressee_user_id, status);

alter table public.user_friendships enable row level security;
revoke all on public.user_friendships from public, anon, authenticated;
grant select on public.user_friendships to authenticated;

create policy user_friendships_participant_read
  on public.user_friendships for select to authenticated
  using (
    requester_user_id = (select auth.uid())
    or addressee_user_id = (select auth.uid())
  );

create or replace function private.list_invitable_lobby_friends_impl(p_lobby_id uuid)
returns table(friend_user_id uuid, display_name text, invitation_status text, is_online boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobby_members
    where lobby_id = p_lobby_id and user_id = v_user_id
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;

  return query
  with accepted_friends as (
    select case
      when friendships.requester_user_id = v_user_id then friendships.addressee_user_id
      else friendships.requester_user_id
    end as user_id
    from public.user_friendships as friendships
    where friendships.status = 'accepted'
      and (friendships.requester_user_id = v_user_id or friendships.addressee_user_id = v_user_id)
  )
  select friends.user_id,
    profiles.display_name,
    case
      when members.user_id is not null then 'in_lobby'
      when invitations.id is not null then 'invited'
      else 'available'
    end,
    coalesce(presence.is_online, false)
  from accepted_friends as friends
  join public.profiles as profiles on profiles.user_id = friends.user_id
  left join public.online_lobby_members as members
    on members.lobby_id = p_lobby_id and members.user_id = friends.user_id
  left join public.online_lobby_invitations as invitations
    on invitations.lobby_id = p_lobby_id
    and invitations.invitee_user_id = friends.user_id
    and invitations.accepted_at is null
    and invitations.dismissed_at is null
  left join lateral (
    select true as is_online
    from public.online_lobby_members as recent_members
    where recent_members.user_id = friends.user_id
      and recent_members.last_seen_at >= pg_catalog.now() - interval '30 seconds'
    limit 1
  ) as presence on true
  order by profiles.display_name;
end;
$$;

create or replace function public.list_invitable_lobby_friends(p_lobby_id uuid)
returns table(friend_user_id uuid, display_name text, invitation_status text, is_online boolean)
language sql
security invoker
set search_path = ''
as $$ select * from private.list_invitable_lobby_friends_impl(p_lobby_id); $$;

create or replace function private.send_online_lobby_friend_invitation_impl(p_lobby_id uuid, p_friend_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.online_lobby_members
    where lobby_id = p_lobby_id and user_id = v_user_id
  ) then raise exception 'lobby_access_denied' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.user_friendships
    where status = 'accepted'
      and (
        (requester_user_id = v_user_id and addressee_user_id = p_friend_user_id)
        or (requester_user_id = p_friend_user_id and addressee_user_id = v_user_id)
      )
  ) then raise exception 'friendship_required' using errcode = '42501'; end if;
  if exists (
    select 1 from public.online_lobby_members
    where lobby_id = p_lobby_id and user_id = p_friend_user_id
  ) then raise exception 'friend_already_in_lobby' using errcode = '22023'; end if;

  insert into public.online_lobby_invitations(lobby_id, inviter_user_id, invitee_user_id)
  values (p_lobby_id, v_user_id, p_friend_user_id)
  on conflict (lobby_id, invitee_user_id)
    where accepted_at is null and dismissed_at is null
  do nothing;
end;
$$;

create or replace function public.send_online_lobby_friend_invitation(p_lobby_id uuid, p_friend_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.send_online_lobby_friend_invitation_impl(p_lobby_id, p_friend_user_id); $$;

revoke all on function private.list_invitable_lobby_friends_impl(uuid) from public, anon, authenticated;
revoke all on function private.send_online_lobby_friend_invitation_impl(uuid, uuid) from public, anon, authenticated;
grant execute on function private.list_invitable_lobby_friends_impl(uuid) to authenticated;
grant execute on function private.send_online_lobby_friend_invitation_impl(uuid, uuid) to authenticated;
revoke all on function public.list_invitable_lobby_friends(uuid) from public, anon;
revoke all on function public.send_online_lobby_friend_invitation(uuid, uuid) from public, anon;
grant execute on function public.list_invitable_lobby_friends(uuid) to authenticated;
grant execute on function public.send_online_lobby_friend_invitation(uuid, uuid) to authenticated;
