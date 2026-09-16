X# Supabase för Snäckschack

Samma projekt som Snäckmageddon: **`snails`** (`lygpfumngyebxoqqncet`,
eu-north-1, Knackpot AB). Konton, push-prenumerationer och VAPID-nyckeln
delas; Snäckschack har eget tabellprefix `snailchess_` och en egen
edge-funktion. Projektfakta, auth-inställningar och hemligheter beskrivs i
snailmageddon-repots `supabase/README.md`.

## Vad som är vårt

| Objekt | Vad |
| --- | --- |
| `snailchess_matches` | ett parti: värd (Gul), gäst (Blå), läge, händelselista `events`, `hp`/`hp_prev` (kaos), `fen`, `result`, `duel` (senaste plyets duell som inspelning) |
| `snailchess_create/join/get/my_matches/submit/resign/claim_timeout/delete` | hela API:t, `security definer` med kontroll på `auth.uid()`; klienten når aldrig tabellen |
| `snailchess_cleanup` + cron `snailchess_cleanup` (04:23) | obesvarade inbjudningar efter 30 dagar, avslutade partier efter 90 |
| edge-funktion `chess-notify-turn` | push "din tur" till motståndaren; läser `snailchess_matches`, skickar via `snails_push_subscriptions` och `snails_vapid_private` |

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
