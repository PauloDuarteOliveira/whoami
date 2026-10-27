-- 008 · "Delete my account".
--
-- A signed-in player can delete their own account: email, password, Google / Discord links and
-- everything saved with it (name, avatar, Day/Night, room settings).
-- Games stay for the other players: players.user_id is "on delete set null" (migration 001), so the
-- deleted player's rows are no longer tied to anyone, and their history disappears with the account.
--
-- security definer: only the database owner can delete from auth.users, so the function runs as the owner,
-- but it only ever deletes the account that is calling it (auth.uid()).
--
-- Run it once in the Supabase SQL Editor. It can be run again safely.

create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only signed-in users may call it (never the public "anon" key on its own).
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

notify pgrst, 'reload schema';
