-- hp before the last ply (so the other client can replay a kaos duel with the
-- right hp), and '?:<san>' events for the capture that was attempted before a
-- miss or a fallen attacker.
alter table public.snailchess_matches add column hp_prev jsonb not null default '{}'::jsonb;

create or replace function public.snailchess_match_json(m public.snailchess_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'names', m.names, 'mode', m.mode, 'status', m.status, 'turn', m.turn,
    'ply_count', m.ply_count, 'events', m.events, 'hp', m.hp, 'hp_prev', m.hp_prev, 'fen', m.fen, 'result', m.result,
    'host', m.host, 'guest', m.guest,
    'my_color', case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end
  );
$$;

create or replace function public.snailchess_submit(p_match uuid, p_ply int, p_events jsonb, p_fen text, p_hp jsonb, p_result jsonb)
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
  update public.snailchess_matches
     set events = events || p_events, ply_count = p_ply, turn = case when me = 'w' then 'b' else 'w' end,
         fen = p_fen, hp_prev = hp, hp = coalesce(p_hp, '{}'::jsonb),
         status = case when p_result is not null then 'finished' else status end,
         result = p_result, updated_at = now()
   where id = p_match returning * into m;
  return public.snailchess_match_json(m);
end $$;
