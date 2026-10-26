-- 26/10: replacing a troll character (game design, section 4 "Troll entries").
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.
--
-- A player reports someone's character; the room votes (the receiver and the writer don't);
-- if most vote to replace it, the writer writes a new one. A second replaced character
-- from the same writer lets the Admin or a Helper kick them, and someone else writes it.

-- 1. Tables -------------------------------------------------------------------------------

create table if not exists reports (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  character_id   uuid not null references characters(id) on delete cascade,
  receiver_id    uuid not null references players(id) on delete cascade,   -- who has the character
  writer_id      uuid references players(id) on delete set null,           -- who wrote it (for the second strike)
  reporter_id    uuid not null references players(id) on delete cascade,
  character_name text not null,                                            -- the reported name, kept after a rewrite
  status         text not null default 'voting' check (status in ('voting', 'kept', 'replaced', 'rewritten')),
  admin_decision text check (admin_decision in ('pending', 'chance', 'kicked')),
  created_at     timestamptz not null default now()
);

create table if not exists report_votes (
  report_id  uuid not null references reports(id) on delete cascade,
  voter_id   uuid not null references players(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  value      text not null check (value in ('keep', 'replace')),
  created_at timestamptz not null default now(),
  primary key (report_id, voter_id)
);

create index if not exists reports_room_idx on reports (room_id);
create index if not exists report_votes_room_idx on report_votes (room_id);

-- 2. Row Level Security: only the room's players see and change them --------------------------

alter table reports enable row level security;
alter table report_votes enable row level security;

drop policy if exists "reports: room players read" on reports;
create policy "reports: room players read" on reports
  for select to authenticated using (is_room_member(room_id));

drop policy if exists "reports: report as yourself" on reports;
create policy "reports: report as yourself" on reports
  for insert to authenticated
  with check (is_room_member(room_id) and reporter_id in (select my_player_ids()));

-- The result is recorded by the reporter (or the Admin), the rewrite by the writer, the decision by a host.
drop policy if exists "reports: room players update" on reports;
create policy "reports: room players update" on reports
  for update to authenticated using (is_room_member(room_id)) with check (is_room_member(room_id));

drop policy if exists "report votes: room players read" on report_votes;
create policy "report votes: room players read" on report_votes
  for select to authenticated using (is_room_member(room_id));

drop policy if exists "report votes: vote as yourself" on report_votes;
create policy "report votes: vote as yourself" on report_votes
  for insert to authenticated
  with check (is_room_member(room_id) and voter_id in (select my_player_ids()));

-- 3. The writer may rename their character, but only after the room voted to replace it ----------------

drop policy if exists "characters: the writer rewrites a replaced one" on characters;
create policy "characters: the writer rewrites a replaced one" on characters
  for update to authenticated
  using (
    written_by in (select my_player_ids())
    and exists (
      select 1 from reports r
      where r.character_id = characters.id
        and r.status = 'replaced'
        and coalesce(r.admin_decision, 'chance') <> 'pending'
    )
  )
  with check (written_by in (select my_player_ids()));

-- 4. Live updates ------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reports') then
    alter publication supabase_realtime add table public.reports;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'report_votes') then
    alter publication supabase_realtime add table public.report_votes;
  end if;
end $$;

-- 5. Tell the REST API about the new tables (otherwise it answers "not in the schema cache" for a while).
notify pgrst, 'reload schema';

-- Check: this should list nine tables, reports and report_votes included.
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
