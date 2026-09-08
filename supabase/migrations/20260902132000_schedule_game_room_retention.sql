create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='retire-stale-game-rooms';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'retire-stale-game-rooms',
    '* * * * *',
    'select * from private.retire_stale_game_rooms(pg_catalog.now())'
  );
end $$;

revoke all on schema cron from public,anon,authenticated;
