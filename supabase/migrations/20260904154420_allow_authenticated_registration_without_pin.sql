grant price_registration_executor to postgres with set true;
set role price_registration_executor;

create or replace function private.create_registration_session_impl(p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pin_result integer;
  v_token text;
  v_token_hash bytea;
  v_expires_at timestamptz;
begin
  if (select auth.uid()) is null then
    v_pin_result := private.verify_registration_pin_impl(p_pin);
    if v_pin_result = -1 then
      return pg_catalog.jsonb_build_object('status', 'invalid_pin');
    elsif v_pin_result = -2 then
      return pg_catalog.jsonb_build_object('status', 'rate_limited');
    elsif v_pin_result = -3 then
      return pg_catalog.jsonb_build_object('status', 'not_configured');
    end if;
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := extensions.digest(
    pg_catalog.convert_to(v_token, 'UTF8'),
    'sha256'
  );
  v_expires_at := pg_catalog.clock_timestamp() + interval '12 hours';

  delete from private.registration_sessions
  where expires_at <= pg_catalog.clock_timestamp();

  insert into private.registration_sessions(token_hash, expires_at)
  values (v_token_hash, v_expires_at);

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'session_token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function private.create_registration_session_impl(text)
  from public, anon, authenticated, service_role;
grant execute on function private.create_registration_session_impl(text)
  to anon, authenticated;

set role postgres;
revoke price_registration_executor from postgres granted by postgres;
