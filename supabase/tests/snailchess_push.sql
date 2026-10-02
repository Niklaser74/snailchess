-- Snäckschack's own push subscriptions: saving moves an endpoint out of the shared
-- snails_push_subscriptions. Run with Supabase MCP execute_sql. It always rolls
-- back: the last line raises on purpose, with "ALL OK" when everything passed.
do $test$
declare a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a'; ep text := 'https://push.example/snailchess-move-test';
begin
  insert into auth.users (id, aud, role) values (a, 'authenticated', 'authenticated');
  insert into public.snails_push_subscriptions (user_id, endpoint, p256dh, auth, lang) values (a, ep, 'k', 's', 'sv');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.snailchess_save_push(ep, 'k2', 's2', 'en');
  if exists (select 1 from public.snails_push_subscriptions where endpoint = ep) then raise exception 'still in the shared table'; end if;
  if not exists (select 1 from public.snailchess_push_subscriptions where endpoint = ep and lang = 'en' and p256dh = 'k2') then raise exception 'not in the snailchess table'; end if;
  perform public.snailchess_save_push(ep, 'k2', 's2', 'en');   -- idempotent
  if (select count(*) from public.snailchess_push_subscriptions where endpoint = ep) <> 1 then raise exception 'duplicated'; end if;
  perform public.snailchess_remove_push(ep);
  if exists (select 1 from public.snailchess_push_subscriptions where endpoint = ep) then raise exception 'remove failed'; end if;
  raise exception 'ALL OK (rolled back): moved out of the shared table, idempotent, removable';
end $test$;
