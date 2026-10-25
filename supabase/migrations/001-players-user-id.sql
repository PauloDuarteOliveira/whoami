-- 26/10: link each player to the Supabase Auth user who created it.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Every player is signed in (anonymously) by the app, so auth.uid() is filled in automatically.
-- Row Level Security uses this column to let each player change only their own data.

alter table players
  add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete set null;

create index if not exists players_user_id_idx on players (user_id);
