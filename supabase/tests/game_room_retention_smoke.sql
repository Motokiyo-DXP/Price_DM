begin;

do $$
begin
  if pg_catalog.to_regprocedure('private.retire_stale_game_rooms(timestamp with time zone)') is null then
    raise exception 'retention worker is missing';
  end if;
  if pg_catalog.to_regprocedure('public.retire_stale_game_rooms()') is null then
    raise exception 'authenticated retention wrapper is missing';
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef('private.retire_stale_game_rooms(timestamp with time zone)'::regprocedure)
  into v_definition;
  if v_definition not like '%1 minute%' or v_definition not like '%5 minutes%' or v_definition not like '%15 minutes%' then
    raise exception 'retention intervals are incomplete';
  end if;
end;
$$;

-- Execute the worker, not only its metadata. An empty candidate set is enough
-- to compile and run every SQL special form in the statement.
select * from private.retire_stale_game_rooms(pg_catalog.now());

rollback;
