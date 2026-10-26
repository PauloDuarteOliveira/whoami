-- 26/10: live updates for the drawing Board.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- The whiteboards table and its Row Level Security rules already exist (schema.sql and 002):
-- each player draws on their own board, and the others only see it when it's shared.
-- This adds it to the Realtime publication so a shared board updates live for the room.

alter publication supabase_realtime add table public.whiteboards;

-- Check: this should list seven tables, whiteboards included.
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
