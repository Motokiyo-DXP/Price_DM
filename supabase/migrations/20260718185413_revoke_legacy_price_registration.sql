-- The application is running on submit_price_record_session_v3, so remove
-- every older name-based price-registration boundary from API roles.

revoke execute on function public.submit_price_record(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
revoke execute on function public.submit_price_record_session(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
revoke execute on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;

revoke execute on function private.submit_price_record_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
revoke execute on function private.submit_price_record_session_impl(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) from public, anon, authenticated, service_role;
revoke execute on function private.submit_price_record_session_v2_impl(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) from public, anon, authenticated, service_role;

comment on function public.submit_price_record(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) is
  'Legacy PIN price registration. API execution disabled; use submit_price_record_session_v3.';
comment on function public.submit_price_record_session(
  text, bigint, text, integer, integer, public.stock_status, date, text, text
) is
  'Legacy session price registration. API execution disabled; use submit_price_record_session_v3.';
comment on function public.submit_price_record_session_v2(
  text, bigint, text, bigint, integer, integer, public.stock_status, date,
  text, text, text[]
) is
  'Legacy name-based canonical price registration. API execution disabled; use submit_price_record_session_v3.';
