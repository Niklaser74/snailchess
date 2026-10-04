-- Svitlistan end to end with made-up players. Run with Supabase MCP
-- execute_sql. It always rolls back: the last line raises on purpose, with
-- "ALL OK" and a log when everything passed.
do $test$
declare a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a'; b uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  c uuid := 'cccccccc-0000-4000-8000-00000000000c';
  today date := public.snailchess_today(); j jsonb; log text := '';
begin
  insert into auth.users (id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'), (c, 'authenticated', 'authenticated');

  -- not on the list: playing does nothing
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  if public.snailchess_streak_played('Cilla') is not null or exists (select 1 from public.snailchess_days where user_id = c) then
    raise exception 'counted a player who never joined';
  end if;
  log := log || 'only joined players count; ';

  -- A: joins, has played the last three days (yesterday is the latest) -> 3
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.snailchess_streak_join('  Anna' || chr(10));
  insert into public.snailchess_days (user_id, day) values (a, today - 1), (a, today - 2), (a, today - 3), (a, today - 5);
  if public.snailchess_streak_current(a) <> 3 then raise exception 'A: % not 3', public.snailchess_streak_current(a); end if;
  -- playing today makes it 4, and best follows
  j := public.snailchess_streak_played('Anna');
  if (j->>'current')::int <> 4 or (j->>'best')::int <> 4 then raise exception 'A played: %', j; end if;
  j := public.snailchess_streak_played('Anna');   -- twice the same day is still one day
  if (j->>'current')::int <> 4 then raise exception 'A twice: %', j; end if;
  log := log || 'counts back to the gap, yesterday counts, one day per day; ';

  -- B: last played three days ago -> 0, not on the board
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.snailchess_streak_join('Bo');
  insert into public.snailchess_days (user_id, day) values (b, today - 3), (b, today - 4);
  j := public.snailchess_streak_board();
  if (j->'me'->>'current')::int <> 0 or j->'me'->'rank' <> 'null'::jsonb then raise exception 'B me: %', j->'me'; end if;
  if exists (select 1 from jsonb_array_elements(j->'top') r where r->>'name' = 'Bo') then raise exception 'B on the board with 0'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'top') r where r->>'name' = 'Anna' and (r->>'days')::int = 4) then raise exception 'A missing: %', j->'top'; end if;
  log := log || 'a broken streak is off the board; ';

  -- the hub's leader (anon function) sees Anna with 4
  j := public.snailchess_streak_leader();
  if (j->'leader'->>'score')::int < 4 then raise exception 'leader: %', j; end if;
  log := log || 'leader; ';

  -- leaving deletes the days
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.snailchess_streak_leave();
  if exists (select 1 from public.snailchess_days where user_id = a) or exists (select 1 from public.snailchess_streakers where user_id = a) then
    raise exception 'leave left data';
  end if;
  log := log || 'leave deletes';

  raise exception 'ALL OK (rolled back): %', log;
end $test$;
