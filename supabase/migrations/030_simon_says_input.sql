-- 030_simon_says_input.sql — atomic Simon Says pad-tap merge.
-- Problem (same class as Trivia 018 / RPS 022 / Wordle 026 /
-- Categories 028): both players tap pads during the same input
-- phase, so plain full-state overwrites would lose one player's
-- progress (last-write-wins). This RPC merges ONE tap into the
-- caller's progress inside a row-locked transaction and settles
-- the round/game when both players are done.
--
-- State shape (see initialStateFor 'simon-says' in GameComponents):
--   phase: 'playing' | 'finished'
--   pattern: number[]            — shared growing pattern (pads 0-3)
--   round: number                — current round (= pattern length)
--   progress: { userId: number } — pads tapped so far this round
--   alive: { userId: bool }      — still in this round (false = tapped wrong)
--   done: { userId: bool }       — finished this round (completed or failed)
--   streak: { userId: number }   — rounds completed so far
--   winner: userId | 'draw' | null
--
-- Rules: a tap must match pattern[progress]. A wrong tap ends that
-- player's run (alive=false, done=true). Completing the pattern
-- marks the player done and streak+1. When both players are done:
-- both completed -> the pattern grows by one pad, the round
-- advances, progress/alive/done reset for the new round; exactly
-- one completed -> that player wins; neither completed -> the
-- longer streak wins, equal streaks are a draw.
-- Returns the new state jsonb, or null when the tap was rejected
-- (not a player, game not playing, player failed/done, bad pad).
create or replace function public.simon_says_input(p_game_id uuid, p_pad int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  pattern jsonb;
  my_id text;
  other_id uuid;
  my_progress int;
  my_alive boolean;
  my_done boolean;
  other_done boolean;
  other_alive boolean;
  my_streak int;
  other_streak int;
  my_completed boolean;
  other_completed boolean;
  expected int;
  winner text;
begin
  if p_pad is null or p_pad < 0 or p_pad > 3 then return null; end if;

  select state into st from public.games where id = p_game_id for update;
  if st is null then return null; end if;
  if coalesce(st->>'phase', '') <> 'playing' then return null; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = auth.uid()) then return null; end if;

  my_id := auth.uid()::text;
  pattern := coalesce(st->'pattern', '[]'::jsonb);
  if jsonb_array_length(pattern) = 0 then return null; end if;

  -- My progress this round. alive defaults to true (not yet failed),
  -- done defaults to false; a missing key means "has not acted yet".
  my_progress := coalesce((st->'progress'->my_id)::int, 0);
  my_alive := coalesce((st->'alive'->my_id)::boolean, true);
  my_done := coalesce((st->'done'->my_id)::boolean, false);
  if not my_alive or my_done then return null; end if;
  if my_progress < 0 or my_progress >= jsonb_array_length(pattern) then return null; end if;

  expected := (pattern->>my_progress)::int;
  if p_pad = expected then
    my_progress := my_progress + 1;
    if my_progress >= jsonb_array_length(pattern) then
      -- Pattern completed: streak grows, round done for me.
      my_done := true;
      my_streak := coalesce((st->'streak'->my_id)::int, 0) + 1;
      st := jsonb_set(st, '{streak}', coalesce(st->'streak', '{}'::jsonb) || jsonb_build_object(my_id, my_streak));
    end if;
  else
    -- Wrong pad: my run ends now.
    my_alive := false;
    my_done := true;
  end if;

  st := jsonb_set(st, '{progress}', coalesce(st->'progress', '{}'::jsonb) || jsonb_build_object(my_id, my_progress));
  st := jsonb_set(st, '{alive}', coalesce(st->'alive', '{}'::jsonb) || jsonb_build_object(my_id, my_alive));
  st := jsonb_set(st, '{done}', coalesce(st->'done', '{}'::jsonb) || jsonb_build_object(my_id, my_done));

  -- The other player: the second game_players row.
  select user_id into other_id from public.game_players
  where game_id = p_game_id and user_id <> auth.uid() limit 1;

  if other_id is null then
    -- Second player has not joined yet: record my tap, settle later.
    update public.games set state = st where id = p_game_id;
    return st;
  end if;

  other_done := coalesce((st->'done'->other_id::text)::boolean, false);
  if not (my_done and other_done) then
    update public.games set state = st where id = p_game_id;
    return st;
  end if;

  -- Both players are done this round: settle it.
  my_completed := my_alive;
  other_alive := coalesce((st->'alive'->other_id::text)::boolean, true);
  other_completed := other_alive;

  if my_completed and other_completed then
    -- Both repeated the pattern: it grows by one pad and the next
    -- round starts. Streaks were already bumped by each player's own
    -- completing tap above.
    pattern := pattern || jsonb_build_array(floor(random() * 4)::int);
    st := jsonb_set(st, '{pattern}', pattern);
    st := jsonb_set(st, '{round}', to_jsonb(coalesce((st->>'round')::int, 1) + 1));
    st := jsonb_set(st, '{progress}', jsonb_build_object(my_id, 0, other_id::text, 0));
    st := jsonb_set(st, '{alive}', jsonb_build_object(my_id, true, other_id::text, true));
    st := jsonb_set(st, '{done}', jsonb_build_object(my_id, false, other_id::text, false));
  else
    if my_completed then
      winner := my_id;
    elsif other_completed then
      winner := other_id::text;
    else
      -- Both failed the same round: the longer streak wins.
      my_streak := coalesce((st->'streak'->my_id)::int, 0);
      other_streak := coalesce((st->'streak'->other_id::text)::int, 0);
      winner := case when my_streak > other_streak then my_id
                     when my_streak < other_streak then other_id::text
                     else 'draw' end;
    end if;
    st := jsonb_set(st, '{phase}', '"finished"'::jsonb);
    st := jsonb_set(st, '{winner}', to_jsonb(winner));
  end if;

  update public.games
  set state = st,
      status = case when coalesce(st->>'phase','') = 'finished' then 'finished' else 'active' end,
      winner_id = case when coalesce(st->>'phase','') = 'finished' and winner is not null and winner <> 'draw' then winner::uuid else null end
  where id = p_game_id;
  return st;
end;
$$;

grant execute on function public.simon_says_input(uuid, int) to authenticated;
