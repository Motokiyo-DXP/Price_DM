-- No bookmark copies and no changes to bookmark/deck/friend RLS.
create table private.shopping_list_shares (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  share_id uuid not null unique default gen_random_uuid(),
  url_token text unique
);
create table private.shopping_list_readers (
  owner_id uuid not null references private.shopping_list_shares(owner_id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  primary key (owner_id, reader_id), check (owner_id <> reader_id)
);
alter table private.shopping_list_shares enable row level security;
alter table private.shopping_list_readers enable row level security;
revoke all on private.shopping_list_shares, private.shopping_list_readers from public, anon, authenticated;

-- JWT expiry alone does not revoke a signed-out session. Check the trusted
-- session claim against Auth's live sessions without exposing that table.
create function private.shopping_session_active() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare sid text := auth.jwt()->>'session_id';
begin
  if auth.uid() is null or sid is null or sid !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  return exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=auth.uid()
    and (s.not_after is null or s.not_after > now()));
end; $$;
revoke all on function private.shopping_session_active() from public, anon, authenticated;

create function private.shopping_friends(p_owner uuid, p_reader uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_friendships f where f.status = 'accepted' and
    ((f.requester_user_id = p_owner and f.addressee_user_id = p_reader) or
     (f.addressee_user_id = p_owner and f.requester_user_id = p_reader)));
$$;

-- Remove explicit grants on friendship removal so re-friending never restores access.
create function private.remove_shopping_friend_grants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (old.status = 'accepted' and new.status <> 'accepted') then
    delete from private.shopping_list_readers r where
      (r.owner_id = old.requester_user_id and r.reader_id = old.addressee_user_id) or
      (r.owner_id = old.addressee_user_id and r.reader_id = old.requester_user_id);
  end if;
  return null;
end; $$;
create trigger shopping_friend_access_removed after delete or update of status on public.user_friendships
for each row execute function private.remove_shopping_friend_grants();

create function private.shopping_share_settings() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); result jsonb;
begin
  if not private.shopping_session_active() then raise exception 'authentication_required' using errcode = '42501'; end if;
  select jsonb_build_object('token', s.url_token, 'readers', coalesce((select jsonb_agg(r.reader_id)
    from private.shopping_list_readers r where r.owner_id = u and private.shopping_friends(u,r.reader_id)), '[]'::jsonb))
    into result from private.shopping_list_shares s where s.owner_id = u;
  return coalesce(result, '{"token":null,"readers":[]}'::jsonb);
end; $$;

create function private.set_shopping_friend(p_reader uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if not private.shopping_session_active() then raise exception 'authentication_required' using errcode = '42501'; end if;
  -- Serialize with friendship deletion as well as concurrent share changes.
  if p_enabled then
    perform 1 from public.user_friendships f where f.status = 'accepted' and
      ((f.requester_user_id = u and f.addressee_user_id = p_reader) or
       (f.addressee_user_id = u and f.requester_user_id = p_reader)) for update;
    if not found then raise exception 'friendship_required' using errcode = '42501'; end if;
    insert into private.shopping_list_shares(owner_id) values(u) on conflict do nothing;
    insert into private.shopping_list_readers values(u, p_reader) on conflict do nothing;
  else
    delete from private.shopping_list_readers where owner_id = u and reader_id = p_reader;
  end if;
end; $$;

create function private.set_shopping_url(p_enabled boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t text;
begin
  if not private.shopping_session_active() then raise exception 'authentication_required' using errcode = '42501'; end if;
  -- Two independent cryptographic UUIDs provide 244 random bits. Re-enabling rotates.
  t := case when p_enabled then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') end;
  insert into private.shopping_list_shares(owner_id,url_token) values(u,t)
    on conflict(owner_id) do update set url_token = excluded.url_token;
  return t;
end; $$;

create function private.shared_shopping_lists() returns table(share_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select s.share_id, p.display_name from private.shopping_list_readers r
  join private.shopping_list_shares s on s.owner_id = r.owner_id
  join public.profiles p on p.user_id = r.owner_id
  where private.shopping_session_active() and r.reader_id = auth.uid() and private.shopping_friends(r.owner_id, auth.uid());
$$;

-- The sole gateway to another account's bookmarks. Never returns owner IDs or timestamps.
create function private.read_shopping_list(p_share_id uuid, p_token text) returns bigint[]
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); owner uuid;
begin
  if p_token is not null then
    if p_token !~ '^[a-f0-9]{64}$' then raise exception 'shopping_list_unavailable' using errcode='42501'; end if;
    select s.owner_id into owner from private.shopping_list_shares s where s.url_token = p_token;
  elsif not private.shopping_session_active() then
    raise exception 'shopping_list_unavailable' using errcode='42501';
  elsif p_share_id is not null then
    select s.owner_id into owner from private.shopping_list_shares s
    where s.share_id = p_share_id and (s.owner_id = u or exists (
      select 1 from private.shopping_list_readers r where r.owner_id = s.owner_id and r.reader_id = u
      and private.shopping_friends(s.owner_id, u)));
  else
    owner := u;
  end if;
  if owner is null then raise exception 'shopping_list_unavailable' using errcode='42501'; end if;
  return coalesce((select array_agg(b.canonical_card_id order by b.created_at desc, b.canonical_card_id)
    from public.account_card_bookmarks b join public.canonical_cards c on c.id=b.canonical_card_id
    where b.user_id = owner and c.deleted_at is null), '{}'::bigint[]);
end; $$;

create function public.shopping_share_settings() returns jsonb language sql security invoker set search_path='' as $$ select private.shopping_share_settings(); $$;
create function public.set_shopping_friend(p_reader uuid, p_enabled boolean) returns void language sql security invoker set search_path='' as $$ select private.set_shopping_friend(p_reader,p_enabled); $$;
create function public.set_shopping_url(p_enabled boolean) returns text language sql security invoker set search_path='' as $$ select private.set_shopping_url(p_enabled); $$;
create function public.shared_shopping_lists() returns table(share_id uuid, display_name text) language sql security invoker set search_path='' as $$ select * from private.shared_shopping_lists(); $$;
create function public.read_shopping_list(p_share_id uuid default null, p_token text default null) returns bigint[] language sql stable security invoker set search_path='' as $$ select private.read_shopping_list(p_share_id,p_token); $$;

revoke all on function private.shopping_friends(uuid,uuid), private.remove_shopping_friend_grants(),
  private.shopping_share_settings(), private.set_shopping_friend(uuid,boolean), private.set_shopping_url(boolean),
  private.shared_shopping_lists(), private.read_shopping_list(uuid,text), public.shopping_share_settings(),
  public.set_shopping_friend(uuid,boolean), public.set_shopping_url(boolean), public.shared_shopping_lists(),
  public.read_shopping_list(uuid,text) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.shopping_share_settings(), private.set_shopping_friend(uuid,boolean),
  private.set_shopping_url(boolean), private.shared_shopping_lists(), public.shopping_share_settings(),
  public.set_shopping_friend(uuid,boolean), public.set_shopping_url(boolean), public.shared_shopping_lists() to authenticated;
grant execute on function private.read_shopping_list(uuid,text), public.read_shopping_list(uuid,text) to anon, authenticated;
