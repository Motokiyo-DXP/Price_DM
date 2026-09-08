do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*)::integer into v_count
  from cron.job
  where jobname='retire-stale-game-rooms'
    and schedule='* * * * *'
    and command='select * from private.retire_stale_game_rooms(pg_catalog.now())'
    and active;
  if v_count <> 1 then raise exception 'retention cron job is missing or duplicated'; end if;
end $$;
