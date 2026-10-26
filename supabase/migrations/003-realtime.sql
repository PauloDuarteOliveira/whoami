-- 26/10: Supabase Realtime.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Supabase only pushes live changes for tables in the "supabase_realtime" publication.
-- Row Level Security still applies: each player only receives changes they're allowed to read.
-- Realtime can take a minute to start sending changes for newly added tables.

alter publication supabase_realtime
  add table public.rooms, public.players, public.characters, public.questions, public.votes, public.notes;

-- Check: this should list the six tables.
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
