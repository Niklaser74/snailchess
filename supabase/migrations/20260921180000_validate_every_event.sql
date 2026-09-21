-- Validate every element of p_events, not just the last one.
--
-- The old check read only the final element ("a ply ends with a move"). The
-- x:/?: entries before it went in unchecked, and js/main.js renderMoves() built
-- the move list with innerHTML — so an opponent could store markup that ran in
-- the other player's browser and read the shared snails.session. The client now
-- escapes on render; this is the other half, so bad entries never get stored.
--
-- The alphabet is everything the game actually writes: SAN (KQRBNP, a-h, 1-8,
-- x, +, #, =, O-O), the "--" miss marker, "x:<squares joined by +>" and
-- "?:<square>". No <, >, ", ' or & — nothing that can open a tag or close an
-- attribute. Live data at the time of writing: 4 events, longest 2 characters,
-- all inside this set.

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
  if exists (
    select 1 from jsonb_array_elements(p_events) as ev
     where jsonb_typeof(ev) <> 'string' or (ev #>> '{}') !~ '^[A-Za-z0-9+#=:?-]{1,12}$'
  ) then raise exception 'bad events'; end if;
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
  if p_result is not null then perform public.snailchess_series_after_finish(p_match); end if;
  return public.snailchess_match_json(m);
end $$;
