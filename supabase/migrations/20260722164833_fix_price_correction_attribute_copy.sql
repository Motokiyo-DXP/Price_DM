-- The review function used a non-existent price_attribute_id column when
-- copying attributes to an approved replacement record. Keep the existing
-- review behavior and correct the column to price_record_attributes.attribute_id.

create or replace function private.review_price_correction_for_admin(
  p_request_id bigint,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_user_id uuid;
  v_request public.price_correction_requests%rowtype;
  v_original public.price_records%rowtype;
  v_replacement_id bigint;
begin
  v_admin_user_id := private.require_admin_user();

  select *
  into v_request
  from public.price_correction_requests
  where id = p_request_id
    and status = 'pending'
  for update;
  if not found then
    raise exception 'correction_not_pending' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    select *
    into v_original
    from public.price_records
    where id = v_request.price_record_id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'price_record_unavailable' using errcode = 'P0001';
    end if;

    insert into public.price_records(
      card_id,
      canonical_card_id,
      card_print_id,
      shop_id,
      sale_price,
      buy_price,
      stock_status,
      observed_on,
      contributor_name,
      note
    ) values (
      v_original.card_id,
      v_original.canonical_card_id,
      v_original.card_print_id,
      v_original.shop_id,
      v_request.proposed_sale_price,
      v_request.proposed_buy_price,
      v_request.proposed_stock_status,
      v_request.proposed_observed_on,
      v_original.contributor_name,
      coalesce(v_request.proposed_note, v_original.note)
    ) returning id into v_replacement_id;

    insert into public.price_record_attributes(price_record_id, attribute_id)
    select v_replacement_id, attributes.attribute_id
    from public.price_record_attributes as attributes
    where attributes.price_record_id = v_original.id;

    update public.price_records
    set
      deleted_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where id = v_original.id;

    update public.price_correction_requests
    set
      status = 'approved',
      reviewed_at = pg_catalog.now(),
      reviewed_by = v_admin_user_id,
      review_note = nullif(pg_catalog.btrim(p_review_note), ''),
      replacement_price_record_id = v_replacement_id
    where id = v_request.id;
  else
    update public.price_correction_requests
    set
      status = 'rejected',
      reviewed_at = pg_catalog.now(),
      reviewed_by = v_admin_user_id,
      review_note = nullif(pg_catalog.btrim(p_review_note), '')
    where id = v_request.id;
  end if;
end;
$$;

revoke all on function private.review_price_correction_for_admin(bigint, text, text)
  from public, anon, authenticated, service_role, price_registration_executor;
grant execute on function private.review_price_correction_for_admin(bigint, text, text)
  to authenticated;
