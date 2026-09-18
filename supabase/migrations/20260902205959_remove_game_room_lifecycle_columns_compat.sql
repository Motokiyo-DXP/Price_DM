do $$
declare
  v_column text;
  v_expected_marker text;
  v_actual_marker text;
begin
  foreach v_column in array array[
    'time_limit_minutes',
    'started_at',
    'ended_at',
    'winner_user_id',
    'end_reason',
    'host_rematch_ready',
    'guest_rematch_ready'
  ]
  loop
    select pg_catalog.col_description('public.game_rooms'::regclass, attribute.attnum)
      into v_actual_marker
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.game_rooms'::regclass
      and attribute.attname = v_column
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if not found then
      raise exception 'compatibility column public.game_rooms.% is missing; refusing lifecycle handoff', v_column;
    end if;

    v_expected_marker := 'price_dm.compat.20260902113158.game_room_lifecycle_columns:' || v_column;
    if v_actual_marker is distinct from v_expected_marker then
      raise exception 'public.game_rooms.% is not a compatibility column; refusing to drop it', v_column;
    end if;
  end loop;

  alter table public.game_rooms
    drop column time_limit_minutes,
    drop column started_at,
    drop column ended_at,
    drop column winner_user_id,
    drop column end_reason,
    drop column host_rematch_ready,
    drop column guest_rematch_ready;
end;
$$;
