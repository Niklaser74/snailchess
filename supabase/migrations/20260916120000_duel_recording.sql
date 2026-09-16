-- The duel of the last ply, as a recording (arena variant, seed and every input
-- both snails made). In battle and kaos the player aims and fires, so the seed
-- alone no longer reproduces the duel — the opponent replays this instead.
alter table public.snailchess_matches add column duel jsonb;
alter table public.snailchess_matches add constraint snailchess_duel_size check (duel is null or pg_column_size(duel) < 100000);

create or replace function public.snailchess_match_json(m public.snailchess_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'names', m.names, 'mode', m.mode, 'status', m.status, 'turn', m.turn,
    'ply_count', m.ply_count, 'events', m.events, 'hp', m.hp, 'hp_prev', m.hp_prev,
    'fen', m.fen, 'result', m.result, 'duel', m.duel,
    'host', m.host, 'guest', m.guest,
    'my_color', case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end
  );
$$;

-- the signature changes, so the old one goes (PostgREST would see two overloads)
drop function if exists public.snailchess_submit(uuid, int, jsonb, text, jsonb, jsonb);

create or replace function public.snailchess_submit(p_match uuid, p_ply int, p_events jsonb, p_fen text, p_hp jsonb, p_result jsonb, p_duel jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; me text; last_ev text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  me := case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end;
  if me is null then raise exception 'not your match'; end if;
  if m.status = 'finished' then raise exception 'match is finished'; end if;
  if m.status = 'open' and not (me = 'w' and p_ply = 1) then raise exception 'waiting for an opponent'; end if;
  if m.turn <> me then raise exception 'not your turn'; end if;
  if p_ply <> m.ply_count + 1 then raise exception 'ply out of order'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 5 then raise exception 'bad events'; end if;
  last_ev := p_events ->> (jsonb_array_length(p_events) - 1);
  if last_ev is null or length(last_ev) > 12 or last_ev like 'x:%' or last_ev like '?:%' then raise exception 'a ply ends with a move'; end if;
  if length(coalesce(p_fen, '')) > 120 then raise exception 'bad fen'; end if;
  if p_result is not null and (p_result ->> 'type') not in ('mate', 'stalemate', 'draw', 'kingLost') then raise exception 'bad result'; end if;
  if p_duel is not null and (jsonb_typeof(p_duel) <> 'object' or jsonb_typeof(p_duel -> 'inputs') <> 'array') then raise exception 'bad duel'; end if;
  update public.snailchess_matches
     set events = events || p_events, ply_count = p_ply, turn = case when me = 'w' then 'b' else 'w' end,
         fen = p_fen, hp_prev = hp, hp = coalesce(p_hp, '{}'::jsonb), duel = p_duel,
         status = case when p_result is not null then 'finished' else status end,
         result = p_result, updated_at = now()
   where id = p_match returning * into m;
  return public.snailchess_match_json(m);
end $$;

grant execute on function public.snailchess_submit(uuid, int, jsonb, text, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.snailchess_submit(uuid, int, jsonb, text, jsonb, jsonb, jsonb) from anon, public;
