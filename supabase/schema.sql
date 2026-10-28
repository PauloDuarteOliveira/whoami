-- WhoAmI database schema (Supabase / PostgreSQL)
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run: it drops and recreates the tables (all data is lost).

drop table if exists whiteboards, notes, messages, votes, questions, characters, players, rooms, deck_cards, decks cascade;

-- Pre-made decks -------------------------------------------------------------

create table decks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default ''
);

create table deck_cards (
  id      uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  name    text not null,
  unique (deck_id, name)
);

-- Rooms ----------------------------------------------------------------------

create table rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-Z0-9]{4}$'),
  mode              text not null default 'novoice' check (mode in ('voice', 'novoice')),
  character_source  text not null default 'custom' check (character_source in ('deck', 'custom')),
  deck_id           uuid references decks(id),
  give_up_after     int  not null default 5 check (give_up_after between 1 and 99),
  turn_timer_sec    int  check (turn_timer_sec in (60, 120, 180)),       -- null = no timer
  writing_timer_sec int  check (writing_timer_sec in (30, 60, 90)),      -- null = no timer
  hide_names        boolean not null default false,
  status            text not null default 'lobby' check (status in ('lobby', 'writing', 'playing', 'finished')),
  turn_number       int  not null default 0,
  current_player_id uuid,                                               -- whose turn it is
  turn_phase        text not null default 'question' check (turn_phase in ('question', 'answer_vote', 'guess', 'guess_vote')),
  turn_started_at   timestamptz,
  writing_ends_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Players (also spectators) --------------------------------------------------

create table players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 16),
  color         text not null default '#F5A524',
  role          text not null default 'player' check (role in ('admin', 'helper', 'player', 'spectator')),
  status        text not null default 'playing' check (status in ('playing', 'finished', 'gave_up', 'kicked', 'left')),
  turn_position int,                                                    -- shuffled order, null for spectators
  finish_place  int,                                                    -- 1st, 2nd... when guessed
  finish_turn   int,
  muted         boolean not null default false,
  last_seen     timestamptz not null default now(),                     -- heartbeat for online / offline
  joined_at     timestamptz not null default now(),
  user_id       uuid default auth.uid() references auth.users(id) on delete set null,  -- Supabase Auth user who owns this player
  unique (room_id, name)
);

alter table rooms
  add constraint rooms_current_player_fk foreign key (current_player_id) references players(id) on delete set null;

-- Characters -----------------------------------------------------------------
-- Custom Pool: written_by is the writer. assigned_to is filled when the game starts
-- (never the writer). Deck games: written_by is null.

create table characters (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  written_by  uuid references players(id) on delete set null,
  assigned_to uuid references players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (room_id, assigned_to)
);

-- Questions and guesses ------------------------------------------------------
-- kind 'question': result is yes / no / unsure (majority of votes)
-- kind 'guess':    result is correct / wrong (tie = wrong, Admin can overrule)

create table questions (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  turn_number int  not null,
  kind        text not null check (kind in ('question', 'guess')),
  text        text not null check (char_length(text) between 2 and 140),
  result      text check (result in ('yes', 'no', 'unsure', 'correct', 'wrong')),  -- null while voting
  overruled   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table votes (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  voter_id    uuid not null references players(id) on delete cascade,
  value       text not null check (value in ('yes', 'no', 'unsure', 'correct', 'wrong')),
  created_at  timestamptz not null default now(),
  unique (question_id, voter_id)
);

-- Player tools ---------------------------------------------------------------

create table messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  player_id  uuid references players(id) on delete set null,          -- null = system message
  text       text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);

create table notes (
  player_id  uuid primary key references players(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  text       text not null default '',
  visible    boolean not null default true,
  updated_at timestamptz not null default now()
);

create table whiteboards (
  player_id  uuid primary key references players(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  image      text not null default '',                                -- PNG data URL
  shared     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Indexes for the queries the app polls most ---------------------------------

create index on players (room_id);
create index on characters (room_id);
create index on questions (room_id, turn_number);
create index on votes (question_id);
create index on messages (room_id, created_at);

-- Keep rooms.updated_at fresh, so clients can poll "has anything changed?" ----

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger rooms_touch before update on rooms
  for each row execute function touch_updated_at();

-- Access ---------------------------------------------------------------------
-- First version: anyone with the app can read and write (like JSON Server).
-- After this file, run supabase/migrations/ in order: 001 links players to Supabase Auth users,
-- 002 replaces these open policies with Row Level Security rules based on auth.uid().

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['decks', 'deck_cards', 'rooms', 'players', 'characters', 'questions', 'votes', 'messages', 'notes', 'whiteboards']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "open access (25/10 version)" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
