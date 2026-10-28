-- 010 · Play again in the same room.
--
-- When a game ends, everyone can go "Back to lobby": same room, same code, same QR code, and new friends
-- can join. The Admin picks the next game's settings and presses Play again, which calls play_again():
--
--   1. The finished game moves to a new, finished room of its own (a copy of the players, with the same
--      accounts, plus the characters, questions, votes and reports). So it stays in everyone's history
--      (the my_games view from 007) exactly as it was.
--   2. This room goes back to the lobby with the new settings: everyone who's still here plays again,
--      including those who joined to watch. Notes and Boards start empty; the chat stays.
--
-- security definer: it moves rows that belong to other players, so it runs as the database owner,
-- but only the room's Admin can call it, and only on a finished game.
--
-- Run it once in the Supabase SQL Editor. It can be run again safely.

-- New rooms ask for 5 questions before Give up (it was 10). The app sends its own value anyway.
alter table rooms alter column give_up_after set default 5;

create or replace function play_again(
  p_room          uuid,
  p_mode          text,
  p_source        text,
  p_deck          uuid,
  p_list          uuid,
  p_give_up       int,
  p_turn_timer    int,
  p_writing_timer int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room    rooms%rowtype;
  v_archive uuid;
  v_code    text;
  v_player  players%rowtype;
  v_copy    uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if not exists (select 1 from players where room_id = p_room and user_id = auth.uid() and role = 'admin') then
    raise exception 'Only the Admin can start the next game';
  end if;
  if v_room.status <> 'finished' then
    raise exception 'The game is not over yet';
  end if;

  -- 1. The finished game gets a room of its own (a free 4-character code nobody uses to join).
  loop
    v_code := upper(substr(md5(random()::text), 1, 4));
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;

  insert into rooms (code, mode, character_source, deck_id, list_id, give_up_after, turn_timer_sec, writing_timer_sec,
                     hide_names, status, turn_number, turn_phase, created_at, updated_at)
  values (v_code, v_room.mode, v_room.character_source, v_room.deck_id, v_room.list_id, v_room.give_up_after,
          v_room.turn_timer_sec, v_room.writing_timer_sec, v_room.hide_names, 'finished', v_room.turn_number,
          'question', v_room.created_at, now())
  returning id into v_archive;

  -- Each player is copied (same account, name, animal, result); everything they did points to the copy.
  -- Someone who left after the game keeps their result: a finish place means they guessed, a finish turn that they gave up.
  for v_player in select * from players where room_id = p_room loop
    insert into players (room_id, name, color, role, status, turn_position, finish_place, finish_turn, muted,
                         last_seen, joined_at, user_id, avatar)
    values (v_archive, v_player.name, v_player.color, v_player.role,
            case when v_player.status = 'left' and v_player.finish_place is not null then 'finished'
                 when v_player.status = 'left' and v_player.finish_turn is not null then 'gave_up'
                 else v_player.status end,
            v_player.turn_position,
            v_player.finish_place, v_player.finish_turn, v_player.muted, v_player.last_seen, v_player.joined_at,
            v_player.user_id, v_player.avatar)
    returning id into v_copy;

    update characters   set assigned_to = v_copy where room_id = p_room and assigned_to = v_player.id;
    update characters   set written_by  = v_copy where room_id = p_room and written_by  = v_player.id;
    update questions    set player_id   = v_copy where room_id = p_room and player_id   = v_player.id;
    update votes        set voter_id    = v_copy where voter_id = v_player.id;
    update reports      set receiver_id = v_copy where room_id = p_room and receiver_id = v_player.id;
    update reports      set writer_id   = v_copy where room_id = p_room and writer_id   = v_player.id;
    update reports      set reporter_id = v_copy where room_id = p_room and reporter_id = v_player.id;
    update report_votes set voter_id    = v_copy where room_id = p_room and voter_id    = v_player.id;
  end loop;

  update characters   set room_id = v_archive where room_id = p_room;
  update questions    set room_id = v_archive where room_id = p_room;
  update reports      set room_id = v_archive where room_id = p_room;
  update report_votes set room_id = v_archive where room_id = p_room;

  -- 2. This room starts over: a clean lobby with the new settings and the same code.
  delete from notes       where room_id = p_room;
  delete from whiteboards where room_id = p_room;

  update players
     set status = 'playing', role = case when role = 'spectator' then 'player' else role end,
         turn_position = null, finish_place = null, finish_turn = null
   where room_id = p_room and status in ('playing', 'finished', 'gave_up');

  update rooms
     set status = 'lobby', turn_number = 0, current_player_id = null, turn_phase = 'question',
         turn_started_at = null, writing_ends_at = null, created_at = now(),
         mode = p_mode, character_source = p_source,
         deck_id = case when p_source = 'deck' then p_deck end,
         list_id = case when p_source = 'list' then p_list end,
         give_up_after = p_give_up, turn_timer_sec = p_turn_timer, writing_timer_sec = p_writing_timer
   where id = p_room;
end;
$$;

-- Only signed-in players (every player is signed in, anonymously or not) may call it.
revoke all on function play_again(uuid, text, text, uuid, uuid, int, int, int) from public, anon;
grant execute on function play_again(uuid, text, text, uuid, uuid, int, int, int) to authenticated;

notify pgrst, 'reload schema';
