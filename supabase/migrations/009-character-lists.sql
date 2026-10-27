-- 009 · Character lists ("My lists").
--
-- A signed-in player keeps their own lists of characters ("Our class", "Disney villains") and can host
-- a room with one: when the game starts, each player gets a character from the list, the same way a
-- pre-made deck works. Nobody else ever sees the list: only its owner can read or change it.
--
-- Run it once in the Supabase SQL Editor. It can be run again safely.

create table if not exists character_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,  -- gone with the account
  name       text not null check (char_length(name) between 1 and 40),
  characters text[] not null default '{}' check (cardinality(characters) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists character_lists_user_idx on character_lists (user_id);

alter table character_lists enable row level security;

drop policy if exists "character lists: only yours" on character_lists;
create policy "character lists: only yours" on character_lists
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A room can now use one of the host's lists.
alter table rooms add column if not exists list_id uuid references character_lists(id) on delete set null;

alter table rooms drop constraint if exists rooms_character_source_check;
alter table rooms add constraint rooms_character_source_check
  check (character_source in ('deck', 'custom', 'list'));

notify pgrst, 'reload schema';
