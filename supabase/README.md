X# Supabase för Snäckschack

Samma projekt som Snäckmageddon: **`snails`** (`lygpfumngyebxoqqncet`,
eu-north-1, Knackpot AB). Konton, push-prenumerationer och VAPID-nyckeln
delas; Snäckschack har eget tabellprefix `snailchess_` och en egen
edge-funktion. Projektfakta, auth-inställningar och hemligheter beskrivs i
snailmageddon-repots `supabase/README.md`.

## Vad som är vårt

| Objekt | Vad |
| --- | --- |
| `snailchess_matches` | ett parti: värd (Gul), gäst (Blå), läge, händelselista `events`, `hp`/`hp_prev` (kaos), `fen`, `result`, `duel` (senaste plyets duell som inspelning), `series_id`, `match_no` |
| `snailchess_series` | en serie mellan två spelare: `best_of` 1/3/5, `wins_host`/`wins_guest`, `draws`, `current_match`, `status`, `winner_user`. Serievärden är bara "spelare A" — färgen står i partiet |
| `snailchess_create/join/get/my_matches/submit/resign/claim_timeout/delete/rematch` | hela API:t, `security definer` med kontroll på `auth.uid()`; klienten når aldrig tabellerna |
| `snailchess_series_after_finish`, `snailchess_series_next_match` | interna: räknar ett avslutat parti och startar nästa eller stänger serien |
| `snailchess_cleanup` + cron `snailchess_cleanup` (04:23) | obesvarade inbjudningar efter 30 dagar, avslutade serier och partier efter 90 |
| edge-funktion `chess-notify-turn` | push "din tur" till motståndaren med seriens ställning; länken går till partiet som pågår nu. Läser `snailchess_matches`/`snailchess_series`, skickar via `snails_push_subscriptions` och `snails_vapid_private` |

## Serier och revansch

Samma modell som Snäckmageddon (`snailmageddon/supabase/migrations/20260904210000_series.sql`),
med två skillnader för schack:

- **Färgerna byts.** Värden i ett parti spelar alltid Gul och drar först, så
  nästa parti byter värd och gäst. Revansch startas av den som var Blå sist.
- **Remi räknas men ger ingen poäng.** Serien fortsätter, men stängs efter
  `best_of * 2` partier så att en rad remier inte pågår för evigt; ledaren vinner
  då, annars slutar serien oavgjord. Bäst av 1 stängs direkt vid remi.

Varje nytt parti hör till en serie (bäst av 1 för ett enskilt parti). Partier
från före serierna saknar `series_id` och behandlas som bäst av 1.
`snailchess_my_matches` visar bara seriens pågående parti. `snailchess_rematch`
återanvänder en serie som redan pågår mellan de två, så båda som klickar på
Revansch hamnar i samma.

`tests/series.sql` provar hela kedjan med två påhittade spelare (färgbyte, remi,
serieslut, revansch från båda håll, remitaket, radering). Kör den med MCP
`execute_sql`; den rullar alltid tillbaka och slutar med ett avsiktligt fel som
börjar med `ALL OK` när allt gick igenom.

Delat och orört: `snails_push_subscriptions`, `snails_save_push`,
`snails_remove_push`, `snails_vapid_private`.

## Händelselistan

Ett drag i taget (`p_ply` = `ply_count + 1`). Varje ply är 1–5 strängar:

- `e4`, `Nxe5`, `O-O` — SAN, vanligt drag
- `?:exd5` — försök till slag som inte lyckades (battle: miss, kaos: anfallaren föll)
- `x:e4` — pjäs som föll i duellen och lämnade brädet (kaos)
- `--` — turen går över utan drag

Servern kontrollerar tur, ordning och form. Reglerna avgörs i klienterna, som
båda spelar upp listan. Duellen följer med i `p_duel`:
`{ variant, rulesVersion, seed, inputs }` — arenan plus varje knapptryck båda
sniglarna gjorde. I battle och kaos siktar spelaren själv, så seedet räcker
inte längre; motståndaren spelar upp inspelningen i stället (`hp_prev` ger
kaos-duellen rätt hp att börja på). Gamla partier utan `duel` spelas upp från
seedet som förut.

## Push-prenumerationer

`snailchess_push_subscriptions` med `snailchess_save_push/remove_push` är Snäckschacks egna
(sedan 2026-10-02, som Snigelkrattan, Snail Story och Snailman). Den delade
`snails_push_subscriptions` saknar spelkolumn, så notiser läckte mellan spelen.
`snailchess_save_push` tar också bort samma endpoint ur den delade tabellen;
`js/push.js` anropar den vid start, så gamla prenumerationer flyttas när
Snäckschack öppnas. `chess-notify-turn` läser och städar bara den egna tabellen.
Test: `tests/snailchess_push.sql`.

## Migrationer

`migrations/*.sql` i filnamnsordning. Applicera med Supabase MCP
(`apply_migration`) eller SQL-editorn. **Kör inte `supabase db push` från
snailmageddon-repot** utan att först lägga till de här filerna i dess historik
(`supabase migration repair`), annars klagar den på okända migrationer.

## Deploy av funktionen

```bash
supabase functions deploy chess-notify-turn --project-ref lygpfumngyebxoqqncet
```

eller Supabase MCP `deploy_edge_function` med `index.ts` + `webpush.js`
(kopia av snailmageddons). `verify_jwt` på.

## Kontot är seriens

`js/account.js` är seriens delade Supabase-klient, ägd av hubben
(`Niklaser74.github.io`) och vendorad hit med `npm run sync:account` — redigera
den aldrig här. `js/supa.js` re-exporterar den. Sessionen ligger under
`snails.session` (allt på snails.se delar origin, så en inloggning per enhet
gäller alla spel); e-post/Google-koppling, namn och utseende sköts på
https://snails.se/account/. Det är det enda undantaget från regeln att nycklar
prefixas `snailchess.`.

## Svitlistan (2026-10-04)

Dagar i rad med ett avslutat parti (alla lägen) eller ett Snigelpost-drag, i
svensk tid. Frivilligt: spelet räknar alltid sviten lokalt (`js/streak.js`,
`snailchess.streakDays`). Den som trycker "Var med på svitlistan" får ett
anonymt konto, och därifrån räknar servern.

| Objekt | Vad |
| --- | --- |
| `snailchess_streakers` | de som är med: namn och bästa svit |
| `snailchess_days` | en rad per spelad dag (drygt ett år sparas) |
| `snailchess_streak_join/played/board/leave` | listan; `leave` raderar spelarens dagar |
| `snailchess_streak_current(uid)` (intern) | dagar i rad som slutar i dag eller i går |
| `snailchess_streak_leader()` | **öppen för anon**: längsta pågående svit (namn, antal dagar som `score`) och hur många som har en, för hubbens kort |

Test: `tests/snailchess_streak.sql` och `test/streak.test.mjs` (lokal räkning,
svensk tid, och att varje RPC finns i en migration med rättigheter).
