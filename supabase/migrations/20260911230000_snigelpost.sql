-- Snigelpost för Snäckschack: matcher i egen takt över nätet. Samma projekt
-- (snails) och samma konton som Snäckmageddon; eget prefix snailchess_.
-- Push-prenumerationer delas (snails_push_subscriptions, snails_save_push).
-- Applicera med Supabase MCP (apply_migration) eller SQL-editorn; snailmageddon-
-- repots `supabase db push` känner inte till den här filen.

create table public.snailchess_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  host uuid not null,                              -- plays Yellow (w) and moves first
  guest uuid,                                      -- plays Blue (b)
  names jsonb not null default '{}'::jsonb,        -- { "w": host name, "b": guest name }
  mode text not null default 'gentle' check (mode in ('gentle', 'light', 'battle', 'kaos')),
  status text not null default 'open' check (status in ('open', 'playing', 'finished')),
  turn text not null default 'w' check (turn in ('w', 'b')),
  ply_count int not null default 0,
  events jsonb not null default '[]'::jsonb,       -- SAN | '--' (turn passed) | 'x:e4' (piece fell), see js/main.js
  hp jsonb not null default '{}'::jsonb,           -- kaos: hp by square
  fen text,
  result jsonb,                                    -- { type: mate|stalemate|draw|kingLost|resign|timeout, winner: w|b|null }
  check (pg_column_size(events) < 200000)
);
create index snailchess_matches_host on public.snailchess_matches (host, updated_at desc);
create index snailchess_matches_guest on public.snailchess_matches (guest, updated_at desc);
alter table public.snailchess_matches enable row level security;
revoke all on public.snailchess_matches from anon, authenticated;

create or replace function public.snailchess_match_json(m public.snailchess_matches)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'names', m.names, 'mode', m.mode, 'status', m.status, 'turn', m.turn,
    'ply_count', m.ply_count, 'events', m.events, 'hp', m.hp, 'fen', m.fen, 'result', m.result,
    'host', m.host, 'guest', m.guest,
    'my_color', case when m.host = auth.uid() then 'w' when m.guest = auth.uid() then 'b' else null end
  );
$$;
revoke all on function public.snailchess_match_json(public.snailchess_matches) from anon, authenticated, public;

create or replace function public.snailchess_create(p_name text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(coalesce(p_name, '')) > 24 then raise exception 'name too long'; end if;
  if p_mode not in ('gentle', 'light', 'battle', 'kaos') then raise exception 'unknown mode'; end if;
  insert into public.snailchess_matches (host, names, mode)
  values (auth.uid(), jsonb_build_object('w', coalesce(nullif(p_name, ''), 'Värd')), p_mode)
  returning * into m;
  return public.snailchess_match_json(m);
end $$;

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
  return public.snailchess_match_json(m);
end $$;

-- open invitations are readable by anyone with the link; otherwise participants only
create or replace function public.snailchess_get(p_match uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.snailchess_matches;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from public.snailchess_matches where id = p_match;
  if m.id is null then raise exception 'no such match'; end if;
  if m.status <> 'open' and m.host <> auth.uid() and coalesce(m.guest, '00000000-0000-0000-0000-000000000000') <> auth.uid() then
    raise exception 'not your match';
  end if;
  return public.snailchess_match_json(m);
end $$;

create or replace function public.snailchess_my_matches()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(public.snailchess_match_json(m) order by m.updated_at desc), '[]'::jsonb)
  from public.snailchess_matches m
  where m.host = auth.uid() or m.guest = auth.uid();
$$;

-- one ply: the events it produced (a move, or pieces falling and the turn passing),
-- the position afterwards and, if the game ended, the result. The server checks
-- turn order and shape; the clients agree on the rules (both replay the events).
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
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 4 then raise exception 'bad events'; end if;
  last_ev := p_events ->> (jsonb_array_length(p_events) - 1);
  if last_ev is null or length(last_ev) > 12 or last_ev like 'x:%' then raise exception 'a ply ends with a move'; end if;
  if length(coalesce(p_fen, '')) > 120 then raise exception 'bad fen'; end if;
  if p_result is not null and (p_result ->> 'type') not in ('mate', 'stalemate', 'draw', 'kingLost') then raise exception 'bad result'; end if;
  update public.snailchess_matches
     set events = events || p_events, ply_count = p_ply, turn = case when me = 'w' then 'b' else 'w' end,
         fen = p_fen, hp = coalesce(p_hp, '{}'::jsonb),
         status = case when p_result is not null then 'finished' else status end,
         result = p_result, updated_at = now()
   where id = p_match returning * into m;
  return public.snailchess_match_json(m);
end $$;

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
  if m.status = 'open' then delete from public.snailchess_matches where id = p_match; return null; end if;
  update public.snailchess_matches
     set status = 'finished', result = jsonb_build_object('type', 'resign', 'winner', case when me = 'w' then 'b' else 'w' end), updated_at = now()
   where id = p_match returning * into m;
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
  return public.snailchess_match_json(m);
end $$;

create or replace function public.snailchess_delete(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.snailchess_matches where id = p_match and (host = auth.uid() or guest = auth.uid());
end $$;

grant execute on function public.snailchess_create(text, text) to authenticated;
grant execute on function public.snailchess_join(uuid, text) to authenticated;
grant execute on function public.snailchess_get(uuid) to authenticated;
grant execute on function public.snailchess_my_matches() to authenticated;
grant execute on function public.snailchess_submit(uuid, int, jsonb, text, jsonb, jsonb) to authenticated;
grant execute on function public.snailchess_resign(uuid) to authenticated;
grant execute on function public.snailchess_claim_timeout(uuid) to authenticated;
grant execute on function public.snailchess_delete(uuid) to authenticated;
revoke execute on function public.snailchess_create(text, text) from anon, public;
revoke execute on function public.snailchess_join(uuid, text) from anon, public;
revoke execute on function public.snailchess_get(uuid) from anon, public;
revoke execute on function public.snailchess_my_matches() from anon, public;
revoke execute on function public.snailchess_submit(uuid, int, jsonb, text, jsonb, jsonb) from anon, public;
revoke execute on function public.snailchess_resign(uuid) from anon, public;
revoke execute on function public.snailchess_claim_timeout(uuid) from anon, public;
revoke execute on function public.snailchess_delete(uuid) from anon, public;

-- housekeeping: unanswered invitations after 30 days, finished games after 90
create or replace function public.snailchess_cleanup()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.snailchess_matches where status = 'open' and guest is null and created_at < now() - interval '30 days';
  delete from public.snailchess_matches where status = 'finished' and updated_at < now() - interval '90 days';
end $$;
revoke all on function public.snailchess_cleanup() from anon, authenticated, public;
select cron.schedule('snailchess_cleanup', '23 4 * * *', $$select public.snailchess_cleanup()$$);
