alter table public.profiles
  add column long_press_ms integer not null default 400
    constraint profiles_long_press_ms_check check (long_press_ms between 320 and 600);

revoke select (long_press_ms), update (long_press_ms)
  on public.profiles from anon;
grant select (long_press_ms) on public.profiles to authenticated;
grant update (long_press_ms) on public.profiles to authenticated;

create or replace function private.broadcast_profile_long_press_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.long_press_ms is distinct from old.long_press_ms then
    perform realtime.send(
      pg_catalog.jsonb_build_object('long_press_ms', new.long_press_ms),
      'long_press_ms_updated',
      'profile-settings:' || new.user_id::text,
      true
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.broadcast_profile_long_press_setting() from public, anon, authenticated;

create trigger profiles_broadcast_long_press_setting
  after update of long_press_ms on public.profiles
  for each row execute function private.broadcast_profile_long_press_setting();

create policy "Users receive their own long press setting broadcasts"
  on realtime.messages for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'profile-settings:' || (select auth.uid())::text
  );
