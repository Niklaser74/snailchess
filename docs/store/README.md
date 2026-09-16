# Butikstexter och pressbilder

Vad som finns här, och var spelet hör hemma. Snäckmageddon har samma mapp med
tre butiker i; Snäckschack har färre, och skälen står nedan.

| Fil | Vad |
| --- | --- |
| `itch.md` | Sidtext för itch.io, svenska och engelska |
| `cover-630x500.png` | Omslaget till itch, genereras med `npm run shots` |
| `screenshots/` | Pressbilder, genereras med `npm run shots` |
| `../../icons/og-1200x630.png` | Delningsbilden (`og:image`), genereras med `npm run og:image` |

## Pressbilderna

| Bild | Storlek | Vad den visar |
| --- | --- | --- |
| `1-bradet.png` | 1080 × 1920 | Italienskt parti, springaren upplyft med sina lagliga rutor |
| `2-sikta.png` | 1920 × 1080 | En bondeduell i battle: du siktar, kraftmätaren laddar, banan landar vid motståndaren |
| `3-schackmatt.png` | 1080 × 1920 | Skolmatt förklarad: damen inringad, kryss där kungen inte kan fly |
| `4-kaos.png` | 1080 × 1920 | Kaos efter några dueller: sprickor i skalen och hälsostaplar |
| `5-menyn.png` | 1080 × 1920 | Menyn med spellägena |
| `6-bred.png` | 1280 × 720 | Brädet med draglistan, för butiker som vill ha liggande bild |

## Bilderna genereras, de fotograferas inte

```bash
npx playwright install chromium   # en gång, i hubbrepot
npm run og:image                  # icons/og-1200x630.png
npm run shots                     # docs/store/screenshots/*.png och omslaget
```

Båda scripten stagar partierna genom `scripts/pose.mjs`: fasta draglistor,
reducerad rörelse och en seedad `Math.random`, så samma kommando ger **samma
fil byte för byte**. Det är kontrollerat genom att köra två gånger och jämföra.
Duellbilden pausas och ställs tillbaka till duellens start (tid, klocka, moln),
och vinkeln kommer från spelets egen skottplanerare. En handvald vinkel siktade
rakt in i backen, och banan blev en enda prick.

Nätverket mot Supabase stängs under fotograferingen: ingen bildkörning ska
kunna skapa ett anonymt konto. Menyns lista över Snigelpost-partier får det
riktiga tomma svaret.

Bilderna visar riktiga spelbilder, inte montage. Vill man ändra vad som syns
ändrar man poseringen — inte bilden i efterhand.

## itch.io

Ja, men som **skyltfönster med en länk** tills vidare. Spel på en och samma
enhet skulle fungera inbäddat, men Snigelposts inbjudningslänkar, konto och
notiser hör till snails.se. Detaljerna och vägen till ett inbäddat bygge står i
`itch.md`.

## Google Play

Serien har redan **en** app på Play: ett tunt TWA-skal (`se.snails.app`) som
visar snails.se. Snäckschack finns alltså där inne redan, utan att något behöver
göras. En egen listning skulle konkurrera med seriens app om samma spel; det är
en marknadsfråga, inte en teknisk. Underlaget för en egen finns i
`../../../dev-snailmageddon/docs/store/google-play.md`.

## Poki

Inte nu. Delar av spelet passar formatet — ett parti mot datorn är en kort
session — men Poki kräver sitt eget SDK och ett bygge utan externa länkar, och
Snigelpost går inte att ha med där. Det är ett eget bygge, som Snäckmageddons
`build-poki.mjs`, och görs om spelet ska dit.
