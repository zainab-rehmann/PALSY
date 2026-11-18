-- 026_wordle_guess.sql — atomic Wordle Duel guess merge.
-- Problem (same class as Trivia 018 / RPS 022): two players guessing
-- within ~1s each overwrote the whole game-state row (last-write-wins),
-- so one guess vanished. This RPC appends ONE guess to the caller's
-- array inside a row-locked transaction and settles the duel when
-- both players are done (solved, or 6 guesses used). Winner: the
-- solver with fewer guesses; both solve in the same count, or neither
-- solves, is a draw. Returns the new state jsonb, or null when the
-- guess was rejected (not a player, game not playing, already done,
-- bad guess, already guessed).
create or replace function public.wordle_guess(p_game_id uuid, p_guess text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  w text;
  g text;
  my_guesses jsonb;
  my_done boolean;
  other_id uuid;
  other_guesses jsonb;
  other_done boolean;
  my_solved boolean;
  other_solved boolean;
  winner text;
  done_now boolean;
begin
  g := upper(btrim(p_guess));
  if g !~ '^[A-Z]{5}$' then return null; end if;

  select state into st from public.games where id = p_game_id for update;
  if st is null then return null; end if;
  if coalesce(st->>'phase', '') <> 'playing' then return null; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = auth.uid()) then return null; end if;

  w := upper(coalesce(st->>'word', ''));
  if w = '' then return null; end if;

  my_guesses := coalesce(st->'guesses'->auth.uid()::text, '[]'::jsonb);
  my_done := coalesce((st->'done'->auth.uid()::text)::boolean, false);
  if my_done then return null; end if;
  if jsonb_array_length(my_guesses) >= 6 then return null; end if;
  -- Reject a repeated guess.
  if exists (select 1 from jsonb_array_elements_text(my_guesses) as x(v) where v = g) then return null; end if;

  my_guesses := my_guesses || jsonb_build_array(g);
  my_solved := (g = w);
  done_now := my_solved or jsonb_array_length(my_guesses) >= 6;

  st := jsonb_set(st, '{guesses}', coalesce(st->'guesses', '{}'::jsonb) || jsonb_build_object(auth.uid()::text, my_guesses));
  st := jsonb_set(st, '{done}', coalesce(st->'done', '{}'::jsonb) || jsonb_build_object(auth.uid()::text, done_now));

  -- The other player: the second game_players row.
  select user_id into other_id from public.game_players
  where game_id = p_game_id and user_id <> auth.uid() limit 1;

  if other_id is not null then
    other_guesses := coalesce(st->'guesses'->other_id::text, '[]'::jsonb);
    other_done := coalesce((st->'done'->other_id::text)::boolean, false);
    other_solved := jsonb_array_length(other_guesses) > 0
      and (other_guesses->>(jsonb_array_length(other_guesses) - 1)) = w;
  else
    other_done := false;
    other_solved := false;
  end if;

  if done_now and other_done then
    if my_solved and other_solved then
      winner := case when jsonb_array_length(my_guesses) < jsonb_array_length(other_guesses) then auth.uid()::text
                     when jsonb_array_length(my_guesses) > jsonb_array_length(other_guesses) then other_id::text
                     else 'draw' end;
    elsif my_solved then
      winner := auth.uid()::text;
    elsif other_solved then
      winner := other_id::text;
    else
      winner := 'draw';
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

grant execute on function public.wordle_guess(uuid, text) to authenticated;
