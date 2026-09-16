-- Series and rematch, end to end in the database with two made-up players.
-- Run with Supabase MCP execute_sql (or the SQL editor). It always rolls back:
-- the last line raises on purpose, with "ALL OK" and a log when everything
-- passed, or the first failing check otherwise. Nothing is left behind.
do $test$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  j jsonb; m1 uuid; m2 uuid; m3 uuid; r1 uuid; sid uuid; log text := '';
  s record; mm record; i int; cur uuid; hostv uuid;
begin
  -- 1-2: A creates best of 3 in battle, B joins
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailchess_create('Anna', 'battle', 3); m1 := (j->>'id')::uuid; sid := (j->'series'->>'id')::uuid;
  if (j->'series'->>'best_of')::int <> 3 or j->>'my_color' <> 'w' then raise exception 'create: %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailchess_join(m1, 'Bo');
  select * into s from public.snailchess_series where id = sid;
  if s.guest <> b or s.status <> 'playing' then raise exception 'join did not reach the series'; end if;

  -- 3: game 1, Blue (B) mates
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true); perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.snailchess_submit(m1, 1, '["f3"]', 'x', '{}', null, null);
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true); perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailchess_submit(m1, 2, '["e5"]', 'x', '{}', '{"type":"mate","winner":"b"}', null);
  if (j->'series'->>'wins_me')::int <> 1 or (j->'series'->>'wins_them')::int <> 0 then raise exception 'B should lead 1-0: %', j->'series'; end if;
  select * into s from public.snailchess_series where id = sid;
  m2 := s.current_match;
  select * into mm from public.snailchess_matches where id = m2;
  if m2 = m1 or mm.host <> b or mm.guest <> a or mm.match_no <> 2 or mm.mode <> 'battle' or mm.status <> 'playing' then raise exception 'game 2 wrong: host %, guest %, no %', mm.host, mm.guest, mm.match_no; end if;
  if mm.names->>'w' <> 'Bo' or mm.names->>'b' <> 'Anna' then raise exception 'names not swapped: %', mm.names; end if;
  log := log || 'g1 B mates -> 0-1, g2 colours swapped (Bo Gul); ';

  -- 4: game 2 is a draw (B is Yellow now and moves first)
  j := public.snailchess_submit(m2, 1, '["e4"]', 'x', '{}', '{"type":"stalemate","winner":null}', null);
  select * into s from public.snailchess_series where id = sid;
  m3 := s.current_match;
  select * into mm from public.snailchess_matches where id = m3;
  if s.draws <> 1 or s.wins_host <> 0 or s.wins_guest <> 1 or mm.host <> a or mm.match_no <> 3 then raise exception 'after draw: %', row_to_json(s); end if;
  log := log || 'g2 draw -> still 0-1, g3 Anna Gul; ';

  -- 5: game 3, A resigns -> B wins the series 2-0 (+1 draw)
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true); perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailchess_resign(m3);
  if (j->'series'->>'status') <> 'finished' or (j->'series'->>'lost_by_me')::boolean is not true or (j->'series'->>'wins_them')::int <> 2 then raise exception 'series end (A view): %', j->'series'; end if;
  log := log || 'g3 Anna resigns -> series finished, Bo 2-0; ';

  -- 6: my matches shows only the current game of the series
  j := public.snailchess_my_matches();
  if (select count(*) from jsonb_array_elements(j) e where (e->'series'->>'id')::uuid = sid) <> 1 then raise exception 'my_matches lists more than one game of the series'; end if;
  if (select e->>'id' from jsonb_array_elements(j) e where (e->'series'->>'id')::uuid = sid) <> m3::text then raise exception 'my_matches shows an old game'; end if;
  log := log || 'my_matches: one row per series; ';

  -- 7: rematch from game 3: whoever was Blue there (Bo) starts as Yellow
  j := public.snailchess_rematch(m3); r1 := (j->>'id')::uuid;
  select * into mm from public.snailchess_matches where id = r1;
  select * into s from public.snailchess_series where id = mm.series_id;
  if mm.host <> b or mm.guest <> a or s.best_of <> 3 or s.status <> 'playing' or mm.mode <> 'battle' or mm.match_no <> 1 then raise exception 'rematch wrong: host % bo % status %', mm.host, s.best_of, s.status; end if;
  -- 8: B asking for a rematch too lands in the same new series
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true); perform set_config('request.jwt.claim.sub', b::text, true);
  j := public.snailchess_rematch(m3);
  if (j->>'id')::uuid <> r1 then raise exception 'second rematch made another series'; end if;
  log := log || 'rematch: new bo3, Bo Gul, both sides land in the same one; ';

  -- 9: best of 1 draw closes at once
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true); perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailchess_create('Anna', 'gentle', 1); cur := (j->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true); perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.snailchess_join(cur, 'Bo');
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true); perform set_config('request.jwt.claim.sub', a::text, true);
  j := public.snailchess_submit(cur, 1, '["e4"]', 'x', '{}', '{"type":"draw","winner":null}', null);
  if j->'series'->>'status' <> 'finished' or (j->'series'->>'won_by_me')::boolean or (j->'series'->>'lost_by_me')::boolean then raise exception 'bo1 draw: %', j->'series'; end if;
  log := log || 'bo1 draw closes, nobody wins; ';

  -- 10: best of 3 made only of draws stops after 6 games
  j := public.snailchess_create('Anna', 'kaos', 3); cur := (j->>'id')::uuid; sid := (j->'series'->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true); perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.snailchess_join(cur, 'Bo');
  for i in 1..10 loop
    select * into s from public.snailchess_series where id = sid;
    exit when s.status = 'finished';
    select host into hostv from public.snailchess_matches where id = s.current_match;
    perform set_config('request.jwt.claims', json_build_object('sub', hostv)::text, true); perform set_config('request.jwt.claim.sub', hostv::text, true);
    perform public.snailchess_submit(s.current_match, 1, '["e4"]', 'x', '{}', '{"type":"draw","winner":null}', null);
  end loop;
  select * into s from public.snailchess_series where id = sid;
  if s.status <> 'finished' or s.draws <> 6 or s.match_no <> 6 or s.winner_user is not null then raise exception 'draw cap: status % draws % no %', s.status, s.draws, s.match_no; end if;
  log := log || 'bo3 of draws stops after 6 games, drawn series; ';

  -- 11: delete removes the whole series with its games
  perform public.snailchess_delete(r1);
  if exists (select 1 from public.snailchess_matches where id = r1) then raise exception 'delete left something'; end if;
  log := log || 'delete removes the series';

  raise exception 'ALL OK (rolled back): %', log;
end $test$;
