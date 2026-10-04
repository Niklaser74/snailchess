-- Svitlistan: days in a row with a game finished (any mode) or a Snigelpost
-- move made. Voluntary: the game always counts a streak locally; a player who
-- presses "Var med på svitlistan" gets an (anonymous) account, and from that
-- day the server counts too. The day is Swedish time.
--
-- snailchess_streak_leader() is open to anon for the hub's card: only the
-- longest current streak's display name and length, and how many have one
-- going — what the list shows everyone. Everything else needs an account.

create or replace function public.snailchess_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Europe/Stockholm')::date;
$$;

create table public.snailchess_streakers (
  user_id   uuid primary key references auth.users on delete cascade,
  name      text not null check (char_length(name) between 1 and 24),
  best      int not null default 0,
  joined_at timestamptz not null default now()
);
create table public.snailchess_days (
  user_id uuid not null references public.snailchess_streakers on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.snailchess_streakers enable row level security;
alter table public.snailchess_days enable row level security;
revoke all on public.snailchess_streakers from anon, authenticated;
revoke all on public.snailchess_days from anon, authenticated;

-- Days in a row ending today or yesterday (yesterday still counts: today is
-- not over). Consecutive days going back keep day + row_number constant.
create or replace function public.snailchess_streak_current(p_user uuid)
returns int language sql stable set search_path = public as $$
  with d as (select day from public.snailchess_days where user_id = p_user and day <= public.snailchess_today()),
       last as (select max(day) as m from d)
  select case when (select m from last) is null or (select m from last) < public.snailchess_today() - 1 then 0
              else (select count(*)::int from (select day + (row_number() over (order by day desc))::int as g from d) x
                     where g = (select m + 1 from last)) end;
$$;

create or replace function public.snailchess_clean_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select left(coalesce(nullif(trim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), ''), 'Snigel'), 24);
$$;

-- The list: top 10 current streaks, the caller's own line, how many are on it.
create or replace function public.snailchess_streak_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); rows jsonb; me jsonb; total int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  with s as (select st.user_id, st.name, st.best, public.snailchess_streak_current(st.user_id) as cur
               from public.snailchess_streakers st),
       ranked as (select s.*, rank() over (order by s.cur desc) as rk from s)
  select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'days', r.cur, 'best', r.best, 'me', r.user_id = uid)
                            order by r.cur desc, r.best desc, r.name) filter (where r.cur > 0 and r.rk <= 10), '[]'),
         (select jsonb_build_object('name', m.name, 'current', m.cur, 'best', m.best,
                                    'rank', case when m.cur > 0 then m.rk end)
            from ranked m where m.user_id = uid),
         count(*) filter (where r.cur > 0)
    into rows, me, total
    from ranked r;
  return jsonb_build_object('top', rows, 'me', me, 'total', total, 'today', public.snailchess_today());
end $$;

create or replace function public.snailchess_streak_join(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.snailchess_streakers (user_id, name) values (auth.uid(), public.snailchess_clean_name(p_name))
  on conflict (user_id) do update set name = excluded.name;
  return public.snailchess_streak_board();
end $$;

-- A game finished or a Snigelpost move made today. Only for players on the
-- list (anyone else: nothing happens). Keeps about a year of days.
create or replace function public.snailchess_streak_played(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cur int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.snailchess_streakers where user_id = uid) then return null; end if;
  insert into public.snailchess_days (user_id, day) values (uid, public.snailchess_today()) on conflict do nothing;
  delete from public.snailchess_days where user_id = uid and day < public.snailchess_today() - 400;
  cur := public.snailchess_streak_current(uid);
  update public.snailchess_streakers
     set best = greatest(best, cur),
         name = case when nullif(trim(coalesce(p_name, '')), '') is null then name else public.snailchess_clean_name(p_name) end
   where user_id = uid;
  return jsonb_build_object('current', cur, 'best', (select best from public.snailchess_streakers where user_id = uid));
end $$;

-- Off the list: the server forgets the days (the game keeps its own count).
create or replace function public.snailchess_streak_leave()
returns void language sql security definer set search_path = public as $$
  delete from public.snailchess_streakers where user_id = auth.uid();
$$;

-- For the hub: the longest current streak and how many have one going.
-- 'score' is the number of days, so the hub can use one renderer for every card.
create or replace function public.snailchess_streak_leader()
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select name, joined_at, public.snailchess_streak_current(user_id) as cur from public.snailchess_streakers)
  select jsonb_build_object(
    'day', public.snailchess_today(),
    'players', (select count(*) from s where cur > 0),
    'leader', (select jsonb_build_object('name', name, 'score', cur) from s where cur > 0
                order by cur desc, joined_at limit 1));
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'snailchess_streak_board()', 'snailchess_streak_join(text)', 'snailchess_streak_played(text)', 'snailchess_streak_leave()'
  ] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['snailchess_today()', 'snailchess_streak_current(uuid)', 'snailchess_clean_name(text)'] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
  end loop;
  execute 'revoke execute on function public.snailchess_streak_leader() from public';
  execute 'grant execute on function public.snailchess_streak_leader() to anon, authenticated';
end $$;
