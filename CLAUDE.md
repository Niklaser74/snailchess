# CLAUDE.md

Snäckschack — schack med Snäckmageddons sniglar. Andra spelet i Knackpots
snigelserie på snails.se. Installerbar PWA utan byggsteg: ren HTML, Canvas och
ES-moduler. Spelas på https://snails.se/snailchess/. Hubben som äger domänen
är repot `Niklaser74.github.io`.

## Kör

| Vad | Kommando |
| --- | --- |
| Utveckling | `npm start` → http://localhost:8082/ |
| Tester | `npm test` |
| Motorn från Snäckmageddon | `npm run sync:game` |
| Ikoner | `npm run icons` |
| Deploy | push till `main` → GitHub Pages |

Kör testerna innan du säger att du är klar. Är de röda när du börjar — säg det
och fortsätt inte som om de var gröna.

## Struktur

```
index.html, js/main.js     UI, meny, spelflöde, spara/fortsätt
js/board.js                brädet — ritar med js/game/snails.js, vet inget om reglerna
js/duel.js                 battle light — kör Snäckmageddons Game med duell-config
js/ai.js                   datorn — negamax på chess.js internals (se kommentaren i filen)
js/vendor/chess.js         reglerna, pinnad 1.4.0
js/game/                   KOPIOR från snailmageddon — ändra där, kör sync:game
test/                      Node-tester
```

## Konventioner

- **Bara relativa sökvägar** (`js/x.js`, `./`, `register('sw.js')`).
  `test/paths.test.mjs` stoppar rotrelativa. Spelet ligger under `/snailchess/`.
- **Allt på snails.se delar origin.** Cache-namn börjar med `snailchess-`,
  `localStorage`-nycklar med `snailchess.`; `sw.js` raderar bara egna cachar.
- UI-text går via `t()` i `js/i18n.js`, svenska och engelska samtidigt;
  testet kräver samma nycklar i båda.
- Nya JS-filer måste in i `sw.js` (testet säger till).
- Sidorna heter Gul (drar först, chess.js `w`) och Blå (`b`). Färgerna är
  Snäckmageddons lagfärger, hämtade från `js/game/snails.js`.
- Battle light: duellen ska alltid sluta med att anfallaren vinner — schacket
  har redan avgjort saken, och ett visat skott får aldrig missa
  (`hittingVariant`). Battle: en miss är en miss (`mustWin: false`), turen
  passas med ett nolldrag. Kaos: båda AI, hp per ruta i `main.js` (`hp`), en
  fallen pjäs tas bort med `chess.remove` och sedan `new Chess(fen)` — chess.js
  `history()`/`pgn()` spelar om dragen och skulle annars återuppväcka den.
  `test/duel.test.mjs` låser alla tre.
- Sparat parti är händelselistan `events` (SAN, `--` = nolldrag, `x:e4` =
  pjäs föll), inte PGN — chess.js kan inte läsa in nolldrag från PGN, och
  borttagna pjäser finns inte i dess historik.
- Följ befintliga mönster i koden framför generella best practices. Ser något
  udda ut finns det oftast ett skäl — fråga innan du rättar det.

## Rör inte

- `manifest.webmanifest` `"id": "/snailchess/"` — appens identitet.
- `js/game/*` och `js/vendor/*` — kopior.
- `docs-vault/` — projektlokalt Obsidian-vault, ska aldrig committas.

## Innan du är klar

1. `npm test` grönt.
2. Ändrade sniglar eller simulering? Det görs i snailmageddon-repot; kör
   `npm run sync:game` här och i hubben.
