drop policy if exists "deny all app config" on public.app_config;
create policy "deny all app config" on public.app_config for all to anon, authenticated using (false) with check (false);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    begin
      alter extension pg_trgm set schema extensions;
    exception when others then
      null;
    end;
  end if;
end $$;
