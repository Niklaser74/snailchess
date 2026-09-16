-- Series and rematch for Snäckschack's Snigelpost, after Snäckmageddon's model
-- (snailmageddon repo, 20260904210000_series.sql) with two chess differences:
--
-- * Colours alternate. The match host always plays Yellow and moves first, so
--   every next game swaps host and guest. A rematch is started by whoever was
--   Blue in the last game.
-- * Draws happen (stalemate, repetition, both snails falling in kaos). A draw
--   gives nobody a point and the series goes on, but a series stops after
--   best_of * 2 games so a run of draws cannot go on for ever; the leader wins
--   it then, or it is drawn.
--
-- Every new game belongs to a series (best of 1 for a single game). Games from
-- before this migration have no series and are treated as best of 1.

create table public.snailchess_series (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  host          uuid not null,   -- player A (created it); says nothing about colour
  guest         uuid,            -- player B
  best_of       int not null default 3 check (best_of in (1, 3, 5)),
  wins_host     int not null default 0,
  wins_guest    int not null default 0,
  draws         int not null default 0,
  match_no      int not null default 1,
  current_match uuid,
  status        text not null default 'open' check (status in ('open', 'playing', 'finished')),
  winner_user   uuid
);
create index snailchess_series_host on public.snailchess_series (host, updated_at desc);
create index snailchess_series_guest on public.snailchess_series (guest, updated_at desc);
alter table public.snailchess_series enable row level security;
revoke all on public.snailchess_series from anon, authenticated;

alter table public.snailchess_matches add column series_id uuid references public.snailchess_series (id) on delete cascade;
alter table public.snailchess_matches add column match_no int not null default 1;
create index snailchess_matches_series on public.snailchess_matches (series_id);

-- ---------- json: the match plus the series from the caller's point of view ----------
create or replace function public.snailchess_match_json(m public.snailchess_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'names', m.names, 'mode', m.mode, 'status', m.status, 'turn', m.turn,
    'ply_count', m.ply_count, 'events', m.events, 'hp', m.hp, 'hp_prev', m.hp_prev,
    'fen', m.fen, 'result', m.result, 'duel', m.duel,
    'host', m.host, 'guest', m.guest, 'match_no', m.match_no,
    'my_color', case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end,
    'series', (select jsonb_build_object(
        'id', s.id, 'best_of', s.best_of, 'match_no', s.match_no, 'status', s.status,
        'current_match', s.current_match, 'draws', s.draws,
        'won_by_me', s.winner_user is not null and s.winner_user = auth.uid(),
        'lost_by_me', s.winner_user is not null and s.winner_user <> auth.uid(),
        'wins_me', case when s.host = auth.uid() then s.wins_host else s.wins_guest end,
        'wins_them', case when s.host = auth.uid() then s.wins_guest else s.wins_host end)
      from public.snailchess_series s where s.id = m.series_id)
  );
$$;
revoke all on function public.snailchess_match_json(public.snailchess_matches) from anon, authenticated, public;

-- ---------- internal: the next game, colours swapped ----------
create or replace function public.snailchess_series_next_match(p_series uuid, p_prev uuid)
returns public.snailchess_matches language plpgsql security definer set search_path = public as $$
declare s public.snailchess_series; prev public.snailchess_matches; n public.snailchess_matches;
begin
  select * into s from public.snailchess_series where id = p_series;
  select * into prev from public.snailchess_matches where id = p_prev;
  insert into public.snailchess_matches (host, guest, names, mode, status, series_id, match_no)
  values (prev.guest, prev.host, jsonb_build_object('w', prev.names->>'b', 'b', prev.names->>'w'),
          prev.mode, 'playing', s.id, s.match_no + 1)
  returning * into n;
  update public.snailchess_series set match_no = n.match_no, current_match = n.id, updated_at = now() where id = s.id;
  return n;
end $$;
revoke all on function public.snailchess_series_next_match(uuid, uuid) from anon, authenticated, public;

-- ---------- internal: a game ended, count it and start the next or close the series ----------
create or replace function public.snailchess_series_after_finish(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; s public.snailchess_series; w uuid; needed int; wh int; wg int; dr int;
begin
  select * into m from public.snailchess_matches where id = p_match;
  if m.series_id is null or m.status <> 'finished' then return; end if;
  select * into s from public.snailchess_series where id = m.series_id for update;
  if s.status = 'finished' or s.current_match <> m.id then return; end if;
  wh := s.wins_host; wg := s.wins_guest; dr := s.draws;
  w := case m.result->>'winner' when 'w' then m.host when 'b' then m.guest else null end;
  if w is null then dr := dr + 1; elsif w = s.host then wh := wh + 1; else wg := wg + 1; end if;
  needed := s.best_of / 2 + 1;
  if wh >= needed or wg >= needed or s.best_of = 1 or s.match_no >= s.best_of * 2 then
    update public.snailchess_series
       set wins_host = wh, wins_guest = wg, draws = dr, status = 'finished', updated_at = now(),
           winner_user = case when wh > wg then s.host when wg > wh then s.guest else null end
     where id = s.id;
  else
    update public.snailchess_series set wins_host = wh, wins_guest = wg, draws = dr, updated_at = now() where id = s.id;
    perform public.snailchess_series_next_match(s.id, m.id);
  end if;
end $$;
revoke all on function public.snailchess_series_after_finish(uuid) from anon, authenticated, public;

-- ---------- create: a series and its first game ----------
drop function if exists public.snailchess_create(text, text);
create or replace function public.snailchess_create(p_name text, p_mode text, p_best_of int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; s public.snailchess_series;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  if p_mode not in ('gentle', 'light', 'battle', 'kaos') then raise exception 'unknown mode'; end if;
  if p_best_of not in (1, 3, 5) then raise exception 'best_of must be 1, 3 or 5'; end if;
  if (select count(*) from public.snailchess_series where host = auth.uid() and status <> 'finished') >= 20 then
    raise exception 'too many open games';
  end if;
  insert into public.snailchess_series (host, best_of) values (auth.uid(), p_best_of) returning * into s;
  insert into public.snailchess_matches (host, names, mode, series_id, match_no)
  values (auth.uid(), jsonb_build_object('w', coalesce(nullif(p_name, ''), 'Värd')), p_mode, s.id, 1)
  returning * into m;
  update public.snailchess_series set current_match = m.id where id = s.id;
  return public.snailchess_match_json(m);
end $$;
grant execute on function public.snailchess_create(text, text, int) to authenticated;
revoke execute on function public.snailchess_create(text, text, int) from anon, public;

-- ---------- join: the series gets its player B too ----------
create or replace function public.snailchess_join(p_match uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  select * into m from public.snailchess_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.host = auth.uid() or m.guest = auth.uid() then return public.snailchess_match_json(m); end if;
  if m.guest is not null then raise exception 'match is full'; end if;
  update public.snailchess_matches
     set guest = auth.uid(), status = 'playing', updated_at = now(),
         names = names || jsonb_build_object('b', coalesce(nullif(p_name, ''), 'Gäst'))
   where id = p_match returning * into m;
  update public.snailchess_series set guest = auth.uid(), status = 'playing', updated_at = now()
   where id = m.series_id and guest is null;
  return public.snailchess_match_json(m);
end $$;

-- ---------- my games: one row per series (its current game) ----------
create or replace function public.snailchess_my_matches()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(public.snailchess_match_json(m) order by m.updated_at desc), '[]'::jsonb)
  from public.snailchess_matches m
  where (m.host = auth.uid() or m.guest = auth.uid())
    and (m.series_id is null or m.id = (select s.current_match from public.snailchess_series s where s.id = m.series_id));
$$;

-- ---------- submit: a finished game advances the series ----------
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
  if p_result is not null then perform public.snailchess_series_after_finish(p_match); end if;
  return public.snailchess_match_json(m);
end $$;

-- ---------- resign / timeout: finish the game, then the series logic ----------
create or replace function public.snailchess_resign(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; me text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  me := case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end;
  if me is null then raise exception 'not your match'; end if;
  if m.status = 'finished' then return public.snailchess_match_json(m); end if;
  if m.status = 'open' then
    if m.series_id is not null then delete from public.snailchess_series where id = m.series_id;
    else delete from public.snailchess_matches where id = p_match; end if;
    return null;
  end if;
  update public.snailchess_matches
     set status = 'finished', result = jsonb_build_object('type', 'resign', 'winner', case when me = 'w' then 'b' else 'w' end), updated_at = now()
   where id = p_match returning * into m;
  perform public.snailchess_series_after_finish(p_match);
  return public.snailchess_match_json(m);
end $$;

create or replace function public.snailchess_claim_timeout(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; me text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  me := case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end;
  if me is null then raise exception 'not your match'; end if;
  if m.status <> 'playing' then raise exception 'match is not in play'; end if;
  if m.turn = me then raise exception 'it is your turn'; end if;
  if m.updated_at > now() - interval '14 days' then raise exception 'opponent still has time'; end if;
  update public.snailchess_matches
     set status = 'finished', result = jsonb_build_object('type', 'timeout', 'winner', me), updated_at = now()
   where id = p_match returning * into m;
  perform public.snailchess_series_after_finish(p_match);
  return public.snailchess_match_json(m);
end $$;

-- ---------- delete: the whole series ----------
create or replace function public.snailchess_delete(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match;
  if m.id is null or (m.host <> auth.uid() and coalesce(m.guest, '00000000-0000-0000-0000-000000000000') <> auth.uid()) then return; end if;
  if m.series_id is not null then delete from public.snailchess_series where id = m.series_id;
  else delete from public.snailchess_matches where id = p_match; end if;
end $$;

-- ---------- rematch: a new series against the same opponent ----------
-- Returns the game to open: the current one if the series is still running or
-- the two already have another series going, otherwise the first game of a new
-- series with the same length and mode. Whoever was Blue last starts as Yellow.
create or replace function public.snailchess_rematch(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches; s public.snailchess_series; ns public.snailchess_series; n public.snailchess_matches; other uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match;
  if m.id is null then raise exception 'no such match'; end if;
  if m.host <> auth.uid() and coalesce(m.guest, '00000000-0000-0000-0000-000000000000') <> auth.uid() then raise exception 'not your match'; end if;
  if m.series_id is not null then
    select * into s from public.snailchess_series where id = m.series_id;
    if s.status <> 'finished' then
      select * into n from public.snailchess_matches where id = s.current_match;
      return public.snailchess_match_json(n);
    end if;
  elsif m.status <> 'finished' then raise exception 'match is not finished';
  end if;
  other := case when m.host = auth.uid() then m.guest else m.host end;
  if other is null then raise exception 'no opponent'; end if;
  select * into ns from public.snailchess_series
   where status <> 'finished' and ((host = auth.uid() and guest = other) or (host = other and guest = auth.uid()))
   order by created_at desc limit 1;
  if ns.id is not null then
    select * into n from public.snailchess_matches where id = ns.current_match;
    return public.snailchess_match_json(n);
  end if;
  insert into public.snailchess_series (host, guest, best_of, status)
  values (auth.uid(), other, coalesce(s.best_of, 1), 'playing')
  returning * into ns;
  insert into public.snailchess_matches (host, guest, names, mode, status, series_id, match_no)
  values (m.guest, m.host, jsonb_build_object('w', m.names->>'b', 'b', m.names->>'w'), m.mode, 'playing', ns.id, 1)
  returning * into n;
  update public.snailchess_series set current_match = n.id where id = ns.id;
  return public.snailchess_match_json(n);
end $$;
grant execute on function public.snailchess_rematch(uuid) to authenticated;
revoke execute on function public.snailchess_rematch(uuid) from anon, public;

-- ---------- cleanup: series too ----------
create or replace function public.snailchess_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.snailchess_series where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snailchess_series where status = 'finished' and updated_at < now() - interval '90 days';
  delete from public.snailchess_matches where series_id is null and status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snailchess_matches where series_id is null and status = 'finished' and updated_at < now() - interval '90 days';
end $$;
