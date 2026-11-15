-- Migration 016: DM-scoped games.
-- Games in 1:1 DMs live in the same games table, scoped by dm_key (the
-- two participants' ids, sorted, joined with ':') with room_id NULL.
-- Room games keep room_id set and dm_key NULL. The CHECK constraint
-- enforces exactly one scope per row. No RLS policy changes: the
-- existing games/game_players policies are scope-agnostic (select
-- using(true), insert own, update using(true)).
alter table public.games
  add column if not exists dm_key text;

alter table public.games
  alter column room_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_scope_check'
  ) then
    alter table public.games
      add constraint games_scope_check
      check ((room_id is null) <> (dm_key is null));
  end if;
end $$;

create index if not exists games_dm_key_idx
  on public.games (dm_key) where dm_key is not null;
