# Snäckschack / Snail Chess

Schack med sniglar. Pjäserna är Snäckmageddons sniglar och kryper till sin
ruta; det tar den tid det tar. Två lägen:

- **Snällt schack** – vanliga regler, ingen skjuter. Den slagna snigeln drar
  sig in i skalet och lämnar brädet. Lagliga drag visas, schack varnas, ångra
  finns. Tänkt för barn, nybörjare, skolor och klubbar.
- **Battle light** – varje slag spelas upp som en kort Snäckmageddon-duell
  där anfallaren skjuter på försvararen. Schackreglerna har redan avgjort
  utgången, så anfallaren vinner alltid; missar skottet tar saltet honom.

Spelas mot datorn (tre nivåer), två på samma enhet, offline som installerad
PWA. Andra spelet i Knackpots snigelserie på [snails.se](https://snails.se),
efter [Snäckmageddon](https://github.com/Niklaser74/snailmageddon).
Adress: **https://snails.se/snailchess/**.

## Kör

| Vad | Kommando |
| --- | --- |
| Utveckling | `npm start` → http://localhost:8082/ |
| Tester | `npm test` (sökvägar, dator, dueller, service worker) |
| Hämta motorn från Snäckmageddon | `npm run sync:game` (`GAME_DIR=../dev-snailmageddon`) |
| PNG-ikoner från `icons/icon.svg` | `npm run icons` (använder hubbrepots Playwright, `PLAYWRIGHT_DIR`) |
| Deploy | push till `main` → `.github/workflows/pages.yml` |

Inget byggsteg och inga beroenden: ren HTML, Canvas och ES-moduler.

## Struktur

```
index.html, css/style.css    meny, HUD, draglista, duell-overlay, hjälp, game over
js/main.js                   spelflöde: meny → parti → duell → game over, spara/fortsätt, PWA
js/board.js                  brädet i Canvas: rutor, markeringar, sniglar som kryper
js/duel.js                   battle light: bygger en Game från js/game/ med duell-config
js/ai.js, js/ai-worker.js    datormotstånd (negamax med alfa-beta, i en Web Worker)
js/pieces.js                 pjäs → hatt, storlek, glyf; Gul/Blå = Snäckmageddons lagfärger
js/i18n.js                   sv/en
js/vendor/chess.js           schackreglerna (chess.js 1.4.0, BSD-2)
js/game/                     kopior från snailmageddon: simulering och renderare (redigera inte här)
sw.js, manifest.webmanifest  PWA (cache-prefix snailchess-, manifest-id /snailchess/)
scripts/                     serve, sync-game, icons
test/                        Node-tester
docs-vault/                  projektlokalt Obsidian-vault, ej i git
```

## Så hänger det ihop

- **Reglerna** kommer från chess.js. Spelet håller aldrig egen schacklogik.
- **Sniglarna** ritas av `js/game/snails.js` med hattar från
  `js/game/cosmetics.js`: krona = kung, hög hatt = dam, keps = torn,
  vikingahjälm = springare, partyhatt = löpare, barhuvad = bonde. Ett litet
  pjäsmärke i rutans hörn hjälper nybörjare.
- **Duellen** är Snäckmageddons `Game` med `width/height/spawns` (tillagt
  uppströms för det här spelet), ett lag per snigel, anfallaren som svår AI
  och försvararen med 15 hp. Arenan väljs från rutan, seedet från draget, så
  samma slag ger samma duell – förberett för spel över nätet.
- **Datorn**: negamax två plies (normal) eller tre (svår), lätt slumpar men
  gillar slag. Stockfish WASM är ett senare steg.

## Sökvägar och origin

Spelet ligger under `snails.se/snailchess/`, så alla sökvägar är relativa
(`test/paths.test.mjs` stoppar rotrelativa). Allt på snails.se delar origin:
cache-namn börjar med `snailchess-`, `localStorage`-nycklar med
`snailchess.`, manifest-`id` är `/snailchess/`.

## Nästa steg

- Battle (anfallaren måste träffa) och Kaos (båda skjuter) som lägen.
- Snigelpost: drag och dueller över nätet i egen takt, samma Supabase-projekt
  `snails` som Snäckmageddon.
- Granaten som duellvapen när AI:ns kastbana är bättre på små arenor.
- Stockfish WASM för den som vill ha riktigt motstånd.
