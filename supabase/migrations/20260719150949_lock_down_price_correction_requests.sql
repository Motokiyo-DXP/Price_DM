create policy "deny direct price correction access"
  on public.price_correction_requests
  for all
  to anon, authenticated
  using (false)
  with check (false);
