-- 26/10: Row Level Security based on Supabase Auth.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Replaces the open "anyone can do anything" policies with rules that use auth.uid(),
-- the anonymous (or real) user every player is signed in as. Requests without a signed-in user can only read the decks.

-- 1. Remove the open policies --------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['decks', 'deck_cards', 'rooms', 'players', 'characters', 'questions', 'votes', 'messages', 'notes', 'whiteboards']
  loop
    execute format('drop policy if exists "open access (25/10 version)" on %I', t);
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- 2. Helper functions ------------------------------------------------------------
-- "security definer" lets them read players without going through the players policies themselves
-- (a policy on players that queries players would loop forever).

create or replace function my_player_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from players where user_id = auth.uid()
$$;

create or replace function is_room_member(target_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where room_id = target_room and user_id = auth.uid())
$$;

create or replace function is_room_host(target_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players
    where room_id = target_room
      and user_id = auth.uid()
      and role in ('admin', 'helper')
      and status <> 'kicked'
  )
$$;

-- 3. Decks: public, read-only --------------------------------------------------------

create policy "decks: everyone reads" on decks
  for select to anon, authenticated using (true);

create policy "deck cards: everyone reads" on deck_cards
  for select to anon, authenticated using (true);

-- 4. Rooms: anyone signed in can open one or find it by code; only its players change it --------

create policy "rooms: signed-in users read" on rooms
  for select to authenticated using (true);

create policy "rooms: signed-in users create" on rooms
  for insert to authenticated with check (true);

create policy "rooms: players update their room" on rooms
  for update to authenticated
  using (is_room_member(id)) with check (is_room_member(id));

-- 5. Players: you change yourself; the Admin and Helpers can change anyone in their room ----------

create policy "players: signed-in users read" on players
  for select to authenticated using (true);

create policy "players: join as yourself" on players
  for insert to authenticated with check (user_id = auth.uid());

create policy "players: update yourself, or anyone if you host the room" on players
  for update to authenticated
  using (user_id = auth.uid() or is_room_host(room_id))
  with check (user_id = auth.uid() or is_room_host(room_id));

create policy "players: leave the lobby yourself" on players
  for delete to authenticated using (user_id = auth.uid());

-- 6. Characters: only the room's players see them; the host deals them ----------------------------

create policy "characters: room players read" on characters
  for select to authenticated using (is_room_member(room_id));

create policy "characters: write your own (or the host adds deck cards)" on characters
  for insert to authenticated
  with check (
    is_room_member(room_id)
    and (written_by in (select my_player_ids()) or (written_by is null and is_room_host(room_id)))
  );

create policy "characters: the host deals them" on characters
  for update to authenticated
  using (is_room_host(room_id)) with check (is_room_host(room_id));

create policy "characters: room players remove duplicates" on characters
  for delete to authenticated using (is_room_member(room_id));

-- 7. Questions and guesses: ask as yourself; the room's players record the result -------------------

create policy "questions: room players read" on questions
  for select to authenticated using (is_room_member(room_id));

create policy "questions: ask as yourself" on questions
  for insert to authenticated
  with check (is_room_member(room_id) and player_id in (select my_player_ids()));

create policy "questions: room players record the result" on questions
  for update to authenticated
  using (is_room_member(room_id)) with check (is_room_member(room_id));

-- 8. Votes: vote as yourself, on questions from your room -----------------------------------------

create policy "votes: room players read" on votes
  for select to authenticated
  using (exists (select 1 from questions q where q.id = question_id and is_room_member(q.room_id)));

create policy "votes: vote as yourself" on votes
  for insert to authenticated
  with check (
    voter_id in (select my_player_ids())
    and exists (select 1 from questions q where q.id = question_id and is_room_member(q.room_id))
  );

-- 9. Notes and whiteboards: yours to write; others see them only when shared ------------------------

create policy "notes: read your own or shared ones" on notes
  for select to authenticated
  using (player_id in (select my_player_ids()) or (visible and is_room_member(room_id)));

create policy "notes: write your own" on notes
  for insert to authenticated
  with check (player_id in (select my_player_ids()) and is_room_member(room_id));

create policy "notes: update your own" on notes
  for update to authenticated
  using (player_id in (select my_player_ids()))
  with check (player_id in (select my_player_ids()));

create policy "whiteboards: read your own or shared ones" on whiteboards
  for select to authenticated
  using (player_id in (select my_player_ids()) or (shared and is_room_member(room_id)));

create policy "whiteboards: write your own" on whiteboards
  for insert to authenticated
  with check (player_id in (select my_player_ids()) and is_room_member(room_id));

create policy "whiteboards: update your own" on whiteboards
  for update to authenticated
  using (player_id in (select my_player_ids()))
  with check (player_id in (select my_player_ids()));

-- 10. Chat (not built yet): room players read; write as yourself -----------------------------------

create policy "messages: room players read" on messages
  for select to authenticated using (is_room_member(room_id));

create policy "messages: write as yourself" on messages
  for insert to authenticated
  with check (is_room_member(room_id) and player_id in (select my_player_ids()));