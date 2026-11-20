-- 028_categories_submit.sql — atomic Categories answer merge.
-- Problem (same class as Trivia 018 / RPS 022 / Wordle 026): two
-- players submitting within ~1s each overwrote the whole game-state
-- row (last-write-wins), so one player's answers vanished. This RPC
-- merges ONE player's answers into state->'answers' inside a
-- row-locked transaction and settles the duel when both players have
-- submitted, or when called after the deadline (state->>'endsAt', JS
-- epoch ms). Scoring: an answer counts only when it is non-empty and
-- its first letter matches the game letter (case-insensitive) — no
-- dictionary. Only answers under the game's own categories count, so
-- extra keys in the payload cannot inflate a score. Winner: more
-- valid answers; a tie is a draw. Returns the new state jsonb, or
-- null when the submit was rejected (not a player, game not playing,
-- already submitted, post-finish, bad payload, no letter yet).
create or replace function public.categories_submit(p_game_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  letter text;
  cats text[];
  ends_at bigint;
  my_done boolean;
  other_id uuid;
  other_done boolean;
  my_score int := 0;
  other_score int := 0;
  winner text;
  past_deadline boolean;
  cat text;
  ans text;
begin
  select state into st from public.games where id = p_game_id for update;
  if st is null then return null; end if;
  if coalesce(st->>'phase', '') <> 'playing' then return null; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = auth.uid()) then return null; end if;

  my_done := coalesce((st->'done'->auth.uid()::text)::boolean, false);
  if my_done then return null; end if;

  letter := upper(coalesce(st->>'letter', ''));
  if letter = '' then return null; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then return null; end if;
  select array_agg(x) into cats from jsonb_array_elements_text(coalesce(st->'categories', '[]'::jsonb)) as x;
  if cats is null then cats := array[]::text[]; end if;

  ends_at := coalesce((st->>'endsAt')::bigint, 0);
  past_deadline := ends_at > 0 and (extract(epoch from clock_timestamp()) * 1000)::bigint > ends_at;

  -- Merge my answers (one object, keyed by category) and mark me done.
  st := jsonb_set(st, '{answers}', coalesce(st->'answers', '{}'::jsonb) || jsonb_build_object(auth.uid()::text, p_answers));
  st := jsonb_set(st, '{done}', coalesce(st->'done', '{}'::jsonb) || jsonb_build_object(auth.uid()::text, true));

  -- The other player: the second game_players row.
  select user_id into other_id from public.game_players
  where game_id = p_game_id and user_id <> auth.uid() limit 1;
  other_done := case when other_id is null then false
    else coalesce((st->'done'->other_id::text)::boolean, false) end;

  if other_done or past_deadline then
    -- Score both sides: non-empty, first letter matches, and the key
    -- is one of the game's categories.
    for cat, ans in select * from jsonb_each_text(coalesce(st->'answers'->auth.uid()::text, '{}'::jsonb)) loop
      if cat = any (cats) and btrim(ans) <> '' and upper(left(btrim(ans), 1)) = letter then
        my_score := my_score + 1;
      end if;
    end loop;
    if other_id is not null then
      for cat, ans in select * from jsonb_each_text(coalesce(st->'answers'->other_id::text, '{}'::jsonb)) loop
        if cat = any (cats) and btrim(ans) <> '' and upper(left(btrim(ans), 1)) = letter then
          other_score := other_score + 1;
        end if;
      end loop;
    end if;
    winner := case when my_score > other_score then auth.uid()::text
                   when my_score < other_score then other_id::text
                   else 'draw' end;
    st := jsonb_set(st, '{phase}', '"finished"'::jsonb);
    st := jsonb_set(st, '{winner}', to_jsonb(winner));
    st := jsonb_set(st, '{scores}', case when other_id is null
      then jsonb_build_object(auth.uid()::text, my_score)
      else jsonb_build_object(auth.uid()::text, my_score, other_id::text, other_score) end);
  end if;

  update public.games
  set state = st,
      status = case when coalesce(st->>'phase','') = 'finished' then 'finished' else 'active' end,
      winner_id = case when coalesce(st->>'phase','') = 'finished' and winner is not null and winner <> 'draw' then winner::uuid else null end
  where id = p_game_id;
  return st;
end;
$$;

grant execute on function public.categories_submit(uuid, jsonb) to authenticated;
