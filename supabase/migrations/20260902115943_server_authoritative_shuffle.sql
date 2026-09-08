create or replace function private.shuffle_game_cards_impl(
  p_room_id uuid,
  p_expected_version bigint,
  p_owner text,
  p_zone text,
  p_mode text,
  p_card_ids text[] default null,
  p_stack_id text default null
)
returns table(state jsonb,state_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.game_rooms%rowtype;
  v_source jsonb;
  v_shuffled jsonb;
  v_next jsonb;
  v_target_count integer;
  v_stack_id text;
begin
  if p_owner not in ('p1','p2') or p_zone not in ('deck','hand','shield','mana','battle','graveyard','hyperspatial','gr','abyss','reveal')
     or p_mode not in ('deck','selection','stack') then
    raise exception 'invalid_shuffle_request' using errcode='22023';
  end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' or v_room.state_version <> p_expected_version
     or v_user_id is null or (v_user_id <> v_room.host_user_id and v_user_id <> v_room.guest_user_id) then
    raise exception 'game_state_conflict' using errcode='40001';
  end if;
  v_source := v_room.state #> array['players',p_owner,p_zone];
  if pg_catalog.jsonb_typeof(v_source) <> 'array' then raise exception 'invalid_game_zone' using errcode='22023'; end if;
  v_stack_id := 'stack-' || pg_catalog.gen_random_uuid()::text;

  with source as (
    select card,position,
      case when p_mode='deck' then true
           when p_mode='selection' then card ->> 'instanceId'=any(coalesce(p_card_ids,array[]::text[]))
           else card ->> 'stackId'=p_stack_id end as selected
    from pg_catalog.jsonb_array_elements(v_source) with ordinality as item(card,position)
  ) select pg_catalog.count(*)::integer into v_target_count from source where selected;
  if v_target_count < 2 then raise exception 'shuffle_requires_multiple_cards' using errcode='22023'; end if;
  if p_mode='selection' and v_target_count <> coalesce(pg_catalog.array_length(p_card_ids,1),0) then
    raise exception 'shuffle_card_not_in_zone' using errcode='23514';
  end if;

  with source as (
    select card,position,
      case when p_mode='deck' then true
           when p_mode='selection' then card ->> 'instanceId'=any(coalesce(p_card_ids,array[]::text[]))
           else card ->> 'stackId'=p_stack_id end as selected
    from pg_catalog.jsonb_array_elements(v_source) with ordinality as item(card,position)
  ), slots as (
    select *,pg_catalog.count(*) filter(where selected) over(order by position) as selected_slot from source
  ), randomized as (
    select pg_catalog.row_number() over(order by pg_catalog.random()) as random_slot,
      case when p_mode='selection' then card || pg_catalog.jsonb_build_object(
        'face','face_down','stackId',v_stack_id)
      when p_mode='stack' then card || pg_catalog.jsonb_build_object('face','face_down')
      else card || pg_catalog.jsonb_build_object('face','face_down') end as card
    from source where selected
  )
  select pg_catalog.jsonb_agg(
    case when slots.selected then (
      select randomized.card || case when p_mode in ('stack','selection') then pg_catalog.jsonb_build_object('stackOrder',slots.selected_slot-1) else '{}'::jsonb end
      from randomized where randomized.random_slot=slots.selected_slot
    ) else slots.card end order by slots.position
  ) into v_shuffled from slots;

  v_next := pg_catalog.jsonb_set(v_room.state,array['players',p_owner,p_zone],v_shuffled,false);
  return query select saved.state,saved.state_version
  from private.update_game_room_state_impl(p_room_id,p_expected_version,v_next) saved;
end;
$$;

revoke all on function private.shuffle_game_cards_impl(uuid,bigint,text,text,text,text[],text) from public,anon,authenticated;
grant execute on function private.shuffle_game_cards_impl(uuid,bigint,text,text,text,text[],text) to authenticated;

create or replace function public.shuffle_game_cards(
  p_room_id uuid,p_expected_version bigint,p_owner text,p_zone text,p_mode text,
  p_card_ids text[] default null,p_stack_id text default null
)
returns table(state jsonb,state_version bigint)
language sql security invoker set search_path = ''
as $$
  select private.redact_game_room_state_for_current_user(p_room_id,shuffled.state),shuffled.state_version
  from private.shuffle_game_cards_impl(p_room_id,p_expected_version,p_owner,p_zone,p_mode,p_card_ids,p_stack_id) shuffled
$$;

revoke all on function public.shuffle_game_cards(uuid,bigint,text,text,text,text[],text) from public,anon;
grant execute on function public.shuffle_game_cards(uuid,bigint,text,text,text,text[],text) to authenticated;
