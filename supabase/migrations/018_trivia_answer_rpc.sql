-- 018_trivia_answer_rpc.sql — atomic Trivia Duel answer merge.
-- Problem (proven live 2026-11-15): two players answering within ~1s
-- each overwrote the whole game-state row (last-write-wins), so one
-- answer vanished and the reveal showed "didn't answer" for a player
-- who had tapped in time. In duel 2 of the verification run, ALL FIVE
-- of player A's correct answers were wiped this way.
-- This RPC merges one answer into state->'answers' inside a SINGLE
-- UPDATE whose WHERE clause re-evaluates against the fresh row, so
-- simultaneous answers from both players both land. Guards (all in
-- the WHERE clause): caller is a player of the game, the game is in
-- 'playing' phase on the same question index, the caller has not
-- already answered this question, and the answer timestamp is not
-- past the armed question end. Returns true when the answer landed.
create or replace function public.trivia_answer(
  p_game_id uuid,
  p_option int,
  p_qi int,
  p_at bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.games
  set state = jsonb_set(
    state,
    '{answers}',
    coalesce(state->'answers', '{}'::jsonb)
      || jsonb_build_object(auth.uid()::text, jsonb_build_object('option', p_option, 'at', p_at))
  )
  where id = p_game_id
    and coalesce(state->>'phase', '') = 'playing'
    and coalesce((state->>'qi')::int, -1) = p_qi
    and not ((state->'answers') ? auth.uid()::text)
    and (
      nullif(state->>'questionEndsAt', '') is null
      or p_at <= nullif(state->>'questionEndsAt', '')::bigint
    )
    and exists (
      select 1 from public.game_players
      where game_id = p_game_id and user_id = auth.uid()
    );
  return found;
end;
$$;

grant execute on function public.trivia_answer(uuid, int, int, bigint) to authenticated;
