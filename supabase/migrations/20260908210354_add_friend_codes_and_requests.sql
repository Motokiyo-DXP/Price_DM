-- Give every account a permanent, human-shareable friend code and expose
-- friendship operations only through authenticated RPCs.

alter table public.profiles add column friend_code text;

update public.profiles as profiles
set friend_code = '00000000'
from auth.users as users
where users.id = profiles.user_id
  and pg_catalog.lower(users.email) = 'mossan.sushi@gmail.com';

with ranked_profiles as (
  select
    profiles.user_id,
    pg_catalog.lpad(
      pg_catalog.row_number() over (order by users.created_at, users.id)::text,
      8,
      '0'
    ) as friend_code
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.user_id
  where pg_catalog.lower(users.email) <> 'mossan.sushi@gmail.com'
)
update public.profiles as profiles
set friend_code = ranked_profiles.friend_code
from ranked_profiles
where ranked_profiles.user_id = profiles.user_id;

alter table public.profiles
  alter column friend_code set not null,
  add constraint profiles_friend_code_format check (friend_code ~ '^[0-9]{8}$'),
  add constraint profiles_friend_code_unique unique (friend_code);

create sequence private.friend_code_seq
  as bigint
  start with 1
  minvalue 1
  maxvalue 99999999
  no cycle;

do $$
declare
  v_highest_code bigint;
begin
  select pg_catalog.max(profiles.friend_code::bigint)
    into v_highest_code
  from public.profiles as profiles
  where profiles.friend_code <> '00000000';

  if v_highest_code is not null then
    perform pg_catalog.setval('private.friend_code_seq', v_highest_code, true);
  end if;
end;
$$;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_requested_name text := pg_catalog.btrim(new.raw_user_meta_data->>'display_name');
  v_friend_code text;
begin
  v_name := case
    when pg_catalog.char_length(v_requested_name) between 1 and 30 then v_requested_name
    else 'user-' || pg_catalog.left(pg_catalog.replace(new.id::text, '-', ''), 8)
  end;
  v_friend_code := case
    when pg_catalog.lower(new.email) = 'mossan.sushi@gmail.com' then '00000000'
    else pg_catalog.lpad(pg_catalog.nextval('private.friend_code_seq')::text, 8, '0')
  end;

  insert into public.profiles(user_id, display_name, friend_code)
  values(new.id, v_name, v_friend_code)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

revoke all on sequence private.friend_code_seq from public, anon, authenticated;
revoke select, update on public.profiles from anon, authenticated;
grant select(user_id, display_name, avatar_url, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant update(display_name, avatar_url, updated_at)
  on public.profiles to authenticated;

create unique index user_friendships_unordered_pair_idx
  on public.user_friendships (
    least(requester_user_id, addressee_user_id),
    greatest(requester_user_id, addressee_user_id)
  );

create or replace function private.get_my_friend_code_impl()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_friend_code text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select profiles.friend_code into v_friend_code
  from public.profiles as profiles
  where profiles.user_id = v_user_id;

  return v_friend_code;
end;
$$;

create or replace function private.list_my_friends_impl()
returns table(
  friend_user_id uuid,
  display_name text,
  avatar_url text,
  friends_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  return query
  select
    case
      when friendships.requester_user_id = v_user_id then friendships.addressee_user_id
      else friendships.requester_user_id
    end,
    profiles.display_name,
    profiles.avatar_url,
    friendships.updated_at
  from public.user_friendships as friendships
  join public.profiles as profiles
    on profiles.user_id = case
      when friendships.requester_user_id = v_user_id then friendships.addressee_user_id
      else friendships.requester_user_id
    end
  where friendships.status = 'accepted'
    and (friendships.requester_user_id = v_user_id or friendships.addressee_user_id = v_user_id)
  order by profiles.display_name, profiles.user_id;
end;
$$;

create or replace function private.list_incoming_friend_requests_impl()
returns table(
  requester_user_id uuid,
  display_name text,
  avatar_url text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  return query
  select
    friendships.requester_user_id,
    profiles.display_name,
    profiles.avatar_url,
    friendships.created_at
  from public.user_friendships as friendships
  join public.profiles as profiles on profiles.user_id = friendships.requester_user_id
  where friendships.addressee_user_id = v_user_id
    and friendships.status = 'pending'
  order by friendships.created_at;
end;
$$;

create or replace function private.send_friend_request_impl(p_friend_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_friend_code text := pg_catalog.replace(pg_catalog.replace(pg_catalog.btrim(p_friend_code), '-', ''), ' ', '');
  v_addressee_user_id uuid;
  v_existing public.user_friendships%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_friend_code !~ '^[0-9]{8}$' then
    raise exception 'invalid_friend_code' using errcode = '22023';
  end if;

  select profiles.user_id into v_addressee_user_id
  from public.profiles as profiles
  where profiles.friend_code = v_friend_code;

  if v_addressee_user_id is null then
    raise exception 'friend_code_not_found' using errcode = 'P0002';
  end if;
  if v_addressee_user_id = v_user_id then
    raise exception 'cannot_friend_self' using errcode = '22023';
  end if;

  select friendships.* into v_existing
  from public.user_friendships as friendships
  where (friendships.requester_user_id = v_user_id and friendships.addressee_user_id = v_addressee_user_id)
     or (friendships.requester_user_id = v_addressee_user_id and friendships.addressee_user_id = v_user_id);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'already_friends' using errcode = '23505';
    elsif v_existing.requester_user_id = v_user_id then
      raise exception 'friend_request_already_sent' using errcode = '23505';
    else
      raise exception 'incoming_friend_request_exists' using errcode = '23505';
    end if;
  end if;

  insert into public.user_friendships(requester_user_id, addressee_user_id)
  values(v_user_id, v_addressee_user_id);

  return 'requested';
end;
$$;

create or replace function private.respond_friend_request_impl(
  p_requester_user_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_accept then
    update public.user_friendships
    set status = 'accepted', updated_at = pg_catalog.now()
    where requester_user_id = p_requester_user_id
      and addressee_user_id = v_user_id
      and status = 'pending';
  else
    delete from public.user_friendships
    where requester_user_id = p_requester_user_id
      and addressee_user_id = v_user_id
      and status = 'pending';
  end if;

  if not found then
    raise exception 'friend_request_not_found' using errcode = 'P0002';
  end if;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

create or replace function public.get_my_friend_code()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_friend_code_impl(); $$;

create or replace function public.list_my_friends()
returns table(
  friend_user_id uuid,
  display_name text,
  avatar_url text,
  friends_since timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_my_friends_impl(); $$;

create or replace function public.list_incoming_friend_requests()
returns table(
  requester_user_id uuid,
  display_name text,
  avatar_url text,
  requested_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_incoming_friend_requests_impl(); $$;

create or replace function public.send_friend_request(p_friend_code text)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.send_friend_request_impl(p_friend_code); $$;

create or replace function public.respond_friend_request(
  p_requester_user_id uuid,
  p_accept boolean
)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.respond_friend_request_impl(p_requester_user_id, p_accept); $$;

revoke all on function private.get_my_friend_code_impl() from public, anon, authenticated;
revoke all on function private.list_my_friends_impl() from public, anon, authenticated;
revoke all on function private.list_incoming_friend_requests_impl() from public, anon, authenticated;
revoke all on function private.send_friend_request_impl(text) from public, anon, authenticated;
revoke all on function private.respond_friend_request_impl(uuid, boolean) from public, anon, authenticated;
grant execute on function private.get_my_friend_code_impl() to authenticated;
grant execute on function private.list_my_friends_impl() to authenticated;
grant execute on function private.list_incoming_friend_requests_impl() to authenticated;
grant execute on function private.send_friend_request_impl(text) to authenticated;
grant execute on function private.respond_friend_request_impl(uuid, boolean) to authenticated;
revoke all on function public.get_my_friend_code() from public, anon;
revoke all on function public.list_my_friends() from public, anon;
revoke all on function public.list_incoming_friend_requests() from public, anon;
revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.get_my_friend_code() to authenticated;
grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.list_incoming_friend_requests() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
