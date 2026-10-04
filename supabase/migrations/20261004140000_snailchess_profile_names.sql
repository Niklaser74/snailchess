-- The names in a game and on the streak board are the account's names, as
-- in Snailman and Snigelkrattan (2026-10-04). Until now they were whatever
-- the game sent from its own name field, or "Snäcka", and a rename on
-- snails.se/account/ never reached them.
--
-- The rule: the series profile name (snails_profiles.name) when the player has
-- chosen one, otherwise the name the game sent. "Snäcka" is the default the
-- profile gets for an empty name, not a choice. A game keeps its names in
-- `names`, keyed by colour: 'w' is always the host and 'b' the guest (the
-- next game of a series swaps host and guest, and the names with them).
-- Several functions write `names` (create, join, the next game of a series,
-- rematch), so the rule is a trigger on the table, not code in each function.

create or replace function public.snailchess_profile_name(p_user uuid)
returns text language sql stable set search_path = public as $$
  select nullif(nullif(left(trim(p.name), 24), ''), 'Snäcka') from public.snails_profiles p where p.user_id = p_user;
$$;
revoke all on function public.snailchess_profile_name(uuid) from anon, authenticated, public;

create or replace function public.snailchess_match_profile_names()
returns trigger language plpgsql security definer set search_path = public as $$
declare nw text := public.snailchess_profile_name(new.host);
        nb text := case when new.guest is null then null else public.snailchess_profile_name(new.guest) end;
begin
  if nw is not null then new.names := coalesce(new.names, '{}'::jsonb) || jsonb_build_object('w', nw); end if;
  if nb is not null then new.names := coalesce(new.names, '{}'::jsonb) || jsonb_build_object('b', nb); end if;
  return new;
end $$;
revoke all on function public.snailchess_match_profile_names() from anon, authenticated, public;
drop trigger if exists snailchess_matches_profile_names on public.snailchess_matches;
create trigger snailchess_matches_profile_names before insert or update of names, host, guest on public.snailchess_matches
  for each row execute function public.snailchess_match_profile_names();

create or replace function public.snailchess_streaker_profile_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := coalesce(public.snailchess_profile_name(new.user_id), new.name);
  return new;
end $$;
revoke all on function public.snailchess_streaker_profile_name() from anon, authenticated, public;
drop trigger if exists snailchess_streakers_profile_name on public.snailchess_streakers;
create trigger snailchess_streakers_profile_name before insert or update of name on public.snailchess_streakers
  for each row execute function public.snailchess_streaker_profile_name();

-- a rename on the account page reaches every game and the streak board
create or replace function public.snailchess_profile_renamed()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := public.snailchess_profile_name(new.user_id);
begin
  if nm is null then return new; end if; -- back to the default: keep what the game sent
  update public.snailchess_matches set names = names || jsonb_build_object('w', nm)
   where host = new.user_id and names->>'w' is distinct from nm;
  update public.snailchess_matches set names = names || jsonb_build_object('b', nm)
   where guest = new.user_id and names->>'b' is distinct from nm;
  update public.snailchess_streakers set name = nm where user_id = new.user_id and name is distinct from nm;
  return new;
end $$;
revoke all on function public.snailchess_profile_renamed() from anon, authenticated, public;
drop trigger if exists snailchess_profile_renamed on public.snails_profiles;
create trigger snailchess_profile_renamed after insert or update of name on public.snails_profiles
  for each row execute function public.snailchess_profile_renamed();

-- once: what is already there (the before-triggers apply the rule)
update public.snailchess_matches m set names = m.names
 where public.snailchess_profile_name(m.host) is not null or (m.guest is not null and public.snailchess_profile_name(m.guest) is not null);
update public.snailchess_streakers s set name = s.name where public.snailchess_profile_name(s.user_id) is not null;
