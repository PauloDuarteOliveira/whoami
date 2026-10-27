-- 27/10: the room chat (Lobby and game). Text only; the app shows the last 100 messages.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.
--
-- The messages table and its "room players read" policy already exist (schema.sql and 002).
-- This makes sending stricter, lets the Admin and Helpers mute someone, and turns on live updates.
-- It also adds the players' avatar (the animal each player picks).

-- 0. Avatars: each player picks one of 30 animals (shared/avatars.ts). Null for players from before.

alter table players add column if not exists avatar text;

-- 1. Faster "last 100 messages of this room" -------------------------------------------------------

create index if not exists messages_room_time_idx on messages (room_id, created_at desc);

-- 2. Send as yourself, while you're in the room and not muted -------------------------------------
--    (kicked players and players who left can still read nothing new: they're out of the room screens)

drop policy if exists "messages: write as yourself" on messages;
create policy "messages: write as yourself" on messages
  for insert to authenticated
  with check (
    is_room_member(room_id)
    and player_id in (select my_player_ids())
    and exists (
      select 1 from players p
      where p.id = player_id
        and p.room_id = messages.room_id
        and not p.muted
        and p.status not in ('kicked', 'left')
    )
  );

-- 3. Only the Admin and Helpers can mute or unmute ---------------------------------------------------
--    Players may update their own row (heartbeat, status…), so without this a muted player could unmute
--    themselves through the API.

create or replace function players_guard_muted() returns trigger
language plpgsql as $$
begin
  if new.muted is distinct from old.muted and not is_room_host(old.room_id) then
    raise exception 'Only the Admin and Helpers can mute or unmute a player';
  end if;
  return new;
end $$;

drop trigger if exists players_guard_muted on players;
create trigger players_guard_muted before update on players
  for each row execute function players_guard_muted();

-- 4. Live updates ------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 5. Tell the REST API about the changes.
notify pgrst, 'reload schema';

-- Check: this should list ten tables, messages included.
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
