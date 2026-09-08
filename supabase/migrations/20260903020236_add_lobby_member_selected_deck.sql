alter table public.online_lobby_members
  add column if not exists selected_deck_id uuid references public.decks(id) on delete set null;

create index if not exists online_lobby_members_selected_deck_idx
  on public.online_lobby_members(selected_deck_id)
  where selected_deck_id is not null;

create or replace function private.set_online_lobby_selected_deck_impl(p_lobby_id uuid,p_deck_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_main_count integer;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists (
    select 1 from public.online_lobby_members members
    where members.lobby_id=p_lobby_id and members.user_id=v_user_id
  ) then raise exception 'lobby_access_denied' using errcode='42501'; end if;

  select coalesce(sum(cards.quantity),0)::integer into v_main_count
  from public.decks decks
  left join public.deck_cards cards on cards.deck_id=decks.id and cards.zone='main'
  where decks.id=p_deck_id and decks.owner_id=v_user_id
  group by decks.id;
  if v_main_count is distinct from 40 then raise exception 'invalid_lobby_deck' using errcode='22023'; end if;

  update public.online_lobby_members
  set selected_deck_id=p_deck_id,last_seen_at=pg_catalog.now()
  where lobby_id=p_lobby_id and user_id=v_user_id;
end;
$$;

revoke all on function private.set_online_lobby_selected_deck_impl(uuid,uuid) from public,anon,authenticated;
grant execute on function private.set_online_lobby_selected_deck_impl(uuid,uuid) to authenticated;

create or replace function public.set_online_lobby_selected_deck(p_lobby_id uuid,p_deck_id uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.set_online_lobby_selected_deck_impl(p_lobby_id,p_deck_id) $$;

revoke all on function public.set_online_lobby_selected_deck(uuid,uuid) from public,anon;
grant execute on function public.set_online_lobby_selected_deck(uuid,uuid) to authenticated;
