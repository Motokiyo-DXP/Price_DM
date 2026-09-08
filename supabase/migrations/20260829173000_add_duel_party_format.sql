alter table public.decks drop constraint if exists decks_format_check;
alter table public.decks add constraint decks_format_check check (format = any (array['original'::text, 'advanced'::text, 'duel_party'::text]));
