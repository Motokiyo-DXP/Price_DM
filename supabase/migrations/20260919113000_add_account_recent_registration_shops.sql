create table public.account_recent_registration_shops (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null references public.shops(id) on delete cascade,
  last_registered_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

comment on table public.account_recent_registration_shops is
  'The five most recently used approved shops for each authenticated price-registration account.';

create index account_recent_registration_shops_user_last_registered_idx
  on public.account_recent_registration_shops (user_id, last_registered_at desc);

alter table public.account_recent_registration_shops enable row level security;

create policy account_recent_registration_shops_select_own
  on public.account_recent_registration_shops for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_recent_registration_shops_insert_own
  on public.account_recent_registration_shops for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy account_recent_registration_shops_update_own
  on public.account_recent_registration_shops for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.account_recent_registration_shops from anon, authenticated;
grant select, insert, update on table public.account_recent_registration_shops to authenticated;

create function public.record_recent_registration_shop(p_shop_id bigint)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.account_recent_registration_shops (
    user_id,
    shop_id,
    last_registered_at
  ) values (
    v_user_id,
    p_shop_id,
    now()
  ) on conflict (user_id, shop_id) do update
  set last_registered_at = excluded.last_registered_at;
end;
$$;

revoke all on function public.record_recent_registration_shop(bigint) from public, anon;
grant execute on function public.record_recent_registration_shop(bigint) to authenticated;

create function public.list_recent_registration_shops()
returns table (
  id bigint,
  name text,
  prefecture text,
  municipality text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    shops.id,
    shops.name,
    shops.prefecture,
    shops.municipality
  from public.account_recent_registration_shops as recent_shops
  join public.shops as shops
    on shops.id = recent_shops.shop_id
  where recent_shops.user_id = (select auth.uid())
    and shops.operational_status = 'active'
  order by recent_shops.last_registered_at desc, shops.id
  limit 5;
$$;

revoke all on function public.list_recent_registration_shops() from public, anon;
grant execute on function public.list_recent_registration_shops() to authenticated;
