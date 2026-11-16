-- 022: atomic Rock Paper Scissors choice (same race class as Trivia 018).
--
-- Proven live 2026-11-16 during the DM-games check: A chose rock and B
-- chose scissors at nearly the same moment, and the game row ended up
-- holding ONLY B's choice — A's choice was clobbered. The client did a
-- read-modify-write (re-read fresh state, merge, full-state UPDATE),
-- which does NOT protect near-simultaneous clicks: both reads can return
-- the empty state and the last write wins.
--
-- Fix: one function, one locked row, one UPDATE. The row lock (FOR UPDATE)
-- serializes concurrent calls, so both choices always merge and the
-- winner is computed from the merged pair. Returns the new state so the
-- caller can render it immediately. Guards: invalid choice, non-player,
-- already chose, or round already decided -> return the current state
-- unchanged (no overwrite).

create or replace function public.rps_choice(p_game_id uuid, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  new_choices jsonb;
  p1 text; p2 text; c1 text; c2 text; w text;
  new_state jsonb;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then return null; end if;
  if p_choice not in ('rock', 'paper', 'scissors') then return g.state; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = auth.uid()) then
    return g.state;
  end if;
  if (g.state->>'winner') is not null then return g.state; end if;
  if (coalesce(g.state->'choices', '{}'::jsonb)) ? auth.uid()::text then return g.state; end if;

  new_choices := coalesce(g.state->'choices', '{}'::jsonb)
    || jsonb_build_object(auth.uid()::text, p_choice);

  w := null;
  if (select count(*) from jsonb_object_keys(new_choices)) = 2 then
    p1 := (select k from jsonb_object_keys(new_choices) as k order by k limit 1);
    p2 := (select k from jsonb_object_keys(new_choices) as k order by k limit 1 offset 1);
    c1 := new_choices->>p1;
    c2 := new_choices->>p2;
    if c1 = c2 then w := 'draw';
    elsif (c1 = 'rock' and c2 = 'scissors')
       or (c1 = 'scissors' and c2 = 'paper')
       or (c1 = 'paper' and c2 = 'rock') then w := p1;
    else w := p2;
    end if;
  end if;

  new_state := g.state || jsonb_build_object('choices', new_choices, 'winner', to_jsonb(w));
  update public.games
     set state = new_state,
         status = case when w is not null then 'finished' else status end,
         winner_id = case when w is not null and w <> 'draw' then w::uuid else winner_id end
   where id = p_game_id;
  return new_state;
end;
$$;

grant execute on function public.rps_choice(uuid, text) to authenticated;
