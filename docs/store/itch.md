# itch.io – sidtext och inställningar

**Titel:** Snäckschack
**Adress:** knackpot.itch.io/snailchess
**Kort beskrivning (tagline):** Schack med sniglar. Pjäserna kryper till sin ruta, och slagen kan avgöras i en duell.
**Klassificering:** HTML5-spel, gratis (betala vad du vill, förslag 20 kr)
**Genre:** Strategy · Taggar: chess, snails, board-game, turn-based, artillery, local-multiplayer, asynchronous-multiplayer, family-friendly, pwa, swedish
**Omslag:** `cover-630x500.png` · Skärmdumpar: `screenshots/*.png` (genereras med `npm run shots`)

## Länka, bädda inte in — än så länge

Sidan ska **länka till snails.se/snailchess/**, inte bädda in spelet. Allt som
spelas på en och samma enhet skulle fungera inbäddat, men Snigelpost skulle inte
det:

- **Inbjudningslänken blir fel.** Den bygger på sidans egen adress, och i itchs
  iframe är det itchs CDN-adress (`html-classic.itch.zone`), som dessutom byts vid
  varje uppladdning. Kompisen som får länken hamnar inte i partiet.
- **Kontot och notiserna hör till snails.se.** I en iframe på en annan domän blir
  spelaren en annan anonym snigel än på snails.se, och Google-inloggning går inte
  alls i en ram (samma sak som Snäckmageddon redan stött på).
- **Sparade partier** hamnar i itchs `localStorage`, skilt från snails.se.

Snäckmageddon löser det med ett eget itch-bygge som döljer kontodelen
(`platform.allowAccounts`). Snäckschack har inget sådant bygge. Blir det
aktuellt är vägen densamma: ett itch-läge som döljer Snigelpost och visar en
länk dit i stället. Tills dess är sidan ett skyltfönster.

Sätt **Kind of project: HTML** utan spelbar fil, eller en sida utan filer, och
lägg länken först i beskrivningen.

## Beskrivning (svenska)

**Spelas på [snails.se/snailchess](https://snails.se/snailchess/)** — gratis, i
webbläsaren, går att installera på hemskärmen.

Vanligt schack, fast pjäserna är sniglar. De kryper till sin ruta, och det tar
den tid det tar. Hatten säger vilken pjäs det är: krona på kungen, hög hatt på
damen, keps på tornen, vikingahjälm på springarna och partyhatt på löparna.
Bönderna går barhuvade.

Sedan väljer du hur mycket som ska smälla:

- **Snällt schack** — inga skott. Lagliga drag visas, schack varnas och ångra finns. Bra för den som lär sig.
- **Battle light** — varje slag spelas upp som en liten duell. Schacket har redan avgjort saken, så anfallaren träffar alltid.
- **Battle** — nu siktar och skjuter du själv. Missar du står pjäsen kvar och turen går över, och missar du räddningsskottet när du står i schack faller kungen.
- **Kaos** — båda skjuter tills en faller, och skadan sitter kvar på snigeln till nästa duell.

Blir det matt spelas draget upp igen, och spelet visar varför: vilken pjäs som
ger schack, och vart kungen hade velat fly men inte kan.

- Spela mot datorn på tre nivåer, två på samma skärm, eller mot en kompis via **Snigelpost** — ett drag när du hinner, med notis när det är din tur
- Snigelpost kan vara ett enstaka parti eller bäst av 3 eller 5, med färgbyte varje parti och revansch efteråt
- Duellerna har tre arenor, två vapen (bazooka och slemklot) och 20 sekunder per skott
- Tre snigelfarter, från "rask, för att vara snigel" till "riktig snigel"
- Fungerar offline, kan installeras som app, inget konto krävs
- Svenska och engelska

Gratis och utan reklam. Vill du stötta utvecklingen får du gärna betala vad du
vill.

## Description (English)

**Played at [snails.se/snailchess](https://snails.se/snailchess/)** — free, in
the browser, installable on your home screen.

Ordinary chess, except the pieces are snails. They crawl to their square, and it
takes as long as it takes. The hat tells you which piece is which: a crown on
the king, a top hat on the queen, caps on the rooks, viking helmets on the
knights and party hats on the bishops. The pawns go bare-headed.

Then you choose how much should go bang:

- **Gentle chess** — no shooting. Legal moves are shown, check is announced and you can undo. Good for learning.
- **Battle light** — every capture is played out as a little duel. The chess has already decided it, so the attacker always hits.
- **Battle** — now you aim and fire yourself. Miss and the piece stays put and the turn passes, and if the rescue shot misses while you are in check, the king falls.
- **Chaos** — both snails shoot until one falls, and the damage stays on the snail until its next duel.

When it is checkmate, the move is replayed and the game shows you why: which
piece gives check, and where the king would have run if it could.

- Play the computer at three levels, two players on one screen, or a friend by **Snail Mail** — one move whenever you have a moment, with a notification when it is your turn
- Snail Mail can be a single game or best of 3 or 5, with colours swapping every game and a rematch afterwards
- The duels have three arenas, two weapons (bazooka and slime ball) and 20 seconds per shot
- Three snail speeds, from "brisk, for a snail" to "proper snail"
- Works offline, installs as an app, no account needed
- Swedish and English

Free and ad-free. If you would like to support the work, pay what you want.

## Konton och länkar

- Utvecklare: Knackpot AB, Hofors
- Serien: [snails.se](https://snails.se)
- Integritetspolicy: https://snails.se/privacy.html

## Att inte skriva

- **Ingen "stark schackdator".** Svår-nivån räknar tre halvdrag framåt. Den slår
  nybörjare och barn, inte klubbspelare, och den som kommer för ett riktigt
  motstånd blir besviken av rätt skäl.
- **Inget "online i realtid".** Snigelpost är turordning i egen takt, ett drag i
  taget med notis. Det är poängen, inte en brist.
- **Siffrorna ovan är räknade ur koden** (lägena i `index.html`, nivåerna i
  `js/ai.js`, vapnen i `js/duel.js`, arenorna i `js/game/themes.js`, 20 sekunder
  och 14 dagar i duell- och seriekoden). Ändras spelet, räkna om.
