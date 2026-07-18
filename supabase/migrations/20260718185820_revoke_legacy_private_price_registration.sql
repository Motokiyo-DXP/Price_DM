-- PostgreSQL 17 tracks function grants by grantor. The legacy private
-- functions were granted by their owner role, so revoke them as that role.

grant price_registration_executor to postgres with set true;
set role price_registration_executor;

revoke execute on function private.submit_price_record_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from anon, authenticated;
revoke execute on function private.submit_price_record_session_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from anon, authenticated;
revoke execute on function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from anon, authenticated;

set role postgres;
revoke price_registration_executor from postgres granted by postgres;

-- Keep postgres active so Supabase CLI can record this migration after the
-- file finishes. The CLI connection is discarded after the push completes.
