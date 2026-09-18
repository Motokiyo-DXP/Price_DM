do $$
declare
  v_column record;
begin
  for v_column in
    select *
    from (
      values
        ('time_limit_minutes', 'smallint not null default 20'),
        ('started_at', 'timestamptz'),
        ('ended_at', 'timestamptz'),
        ('winner_user_id', 'uuid'),
        ('end_reason', 'text'),
        ('host_rematch_ready', 'boolean not null default false'),
        ('guest_rematch_ready', 'boolean not null default false')
    ) as columns(column_name, column_definition)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = 'public.game_rooms'::regclass
        and attribute.attname = v_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      execute format(
        'alter table public.game_rooms add column %I %s',
        v_column.column_name,
        v_column.column_definition
      );
      execute format(
        'comment on column public.game_rooms.%I is %L',
        v_column.column_name,
        'price_dm.compat.20260902113158.game_room_lifecycle_columns:' || v_column.column_name
      );
    end if;
  end loop;
end;
$$;
