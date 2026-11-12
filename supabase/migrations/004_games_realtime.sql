-- PALSY migration 004 (2026-11-10): realtime for games so both players see moves live
do $$
begin
  begin
    alter publication supabase_realtime add table public.games;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.game_players;
  exception when duplicate_object then null;
  end;
end $$;
