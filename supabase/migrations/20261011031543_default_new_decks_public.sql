-- Only future inserts that omit visibility use this default; existing decks are unchanged.
alter table public.decks alter column visibility set default 'public';
