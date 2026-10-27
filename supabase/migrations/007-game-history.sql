-- 007 · Game history for signed-in players.
--
-- One read-only view: every finished game you played in, one row per game, with your character,
-- how you finished, how many questions you asked, and who the others were (and what they were).
-- No new table: players.user_id already ties each player to an account.
--
-- security_invoker = true: the view runs with YOUR permissions, so the Row Level Security rules
-- from 002 still apply. You only ever see games you were in.
--
-- Run it once in the Supabase SQL Editor. It can be run again safely.

create or replace view my_games with (security_invoker = true) as
select
  p.id                 as player_id,
  r.id                 as room_id,
  r.code,
  r.mode,
  r.character_source,
  r.created_at         as started_at,
  r.updated_at         as ended_at,
  p.name,
  p.avatar,
  p.color,
  p.role,
  p.status,                                   -- finished (guessed) · gave_up · playing (still guessing at the end)
  p.finish_place,                             -- 1 = guessed first
  p.finish_turn,
  (select c.name from characters c where c.assigned_to = p.id)                        as character,
  (select count(*) from questions q where q.player_id = p.id and q.kind = 'question')::int as questions_asked,
  (select count(*) from questions q where q.player_id = p.id and q.kind = 'guess')::int    as guesses,
  (select coalesce(json_agg(json_build_object(
             'name', o.name,
             'avatar', o.avatar,
             'color', o.color,
             'status', o.status,
             'finish_place', o.finish_place,
             'character', (select c2.name from characters c2 where c2.assigned_to = o.id)
           ) order by o.finish_place nulls last, o.joined_at), '[]'::json)
     from players o
    where o.room_id = r.id and o.id <> p.id
      and o.role <> 'spectator' and o.status not in ('kicked', 'left'))              as others
from players p
join rooms r on r.id = p.room_id
where p.user_id = auth.uid()
  and r.status = 'finished'
  and p.role <> 'spectator'
  and p.status not in ('kicked', 'left');

grant select on my_games to authenticated;

-- Finding your own players quickly, however many games are stored.
create index if not exists players_user_idx on players (user_id);

notify pgrst, 'reload schema';
