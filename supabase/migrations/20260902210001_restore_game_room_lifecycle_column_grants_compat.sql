grant select (
  time_limit_minutes,
  started_at,
  ended_at,
  winner_user_id,
  end_reason,
  host_rematch_ready,
  guest_rematch_ready
) on public.game_rooms to authenticated;
