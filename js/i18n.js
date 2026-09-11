// UI strings in Swedish and English. Same pattern as Snäckmageddon: t(key, params).
export const LANGS = { sv: 'Svenska', en: 'English' };

const dict = {
  sv: {
    'app.name': 'Snäckschack',
    'app.tagline': 'Schack med sniglar. Pjäserna kryper till sin ruta. Det tar den tid det tar.',
    'app.by': 'En <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a>-produkt',
    'app.hub': 'Fler snigelspel på snails.se',
    'menu.opponent': 'Motståndare',
    'opp.human': 'Två spelare, samma enhet', 'opp.easy': 'Dator – lätt', 'opp.normal': 'Dator – normal', 'opp.hard': 'Dator – svår',
    'menu.side': 'Du spelar', 'side.w': 'Gul (drar först)', 'side.b': 'Blå', 'side.random': 'Slumpa',
    'menu.speed': 'Snigelfart', 'speed.fast': 'Rask, för att vara snigel', 'speed.normal': 'Lagom', 'speed.snail': 'Riktig snigel',
    'menu.hints': 'Visa lagliga drag', 'menu.badges': 'Pjäsmärken i rutorna', 'menu.flip': 'Vänd brädet mot den som ska dra',
    'menu.start': 'Nytt parti', 'menu.continue': 'Fortsätt partiet', 'menu.help': 'Så spelar du', 'menu.install': 'Installera app',
    'menu.lang': 'Språk', 'menu.offline': 'Spelet är sparat för offline-spel.',
    'team.w': 'Gul', 'team.b': 'Blå',
    'hud.turn': '{team} drar', 'hud.check': 'Schack!', 'hud.thinking': 'Datorn tänker…', 'hud.ai': '(dator)',
    'aria.undo': 'Ångra', 'aria.flip': 'Vänd brädet', 'aria.menu': 'Meny',
    'moves.title': 'Drag',
    'msg.inCheck': 'Du står i schack – rädda kungen!',
    'over.title': 'Partiet är slut',
    'over.mate': '{team} vinner – schackmatt!', 'over.stalemate': 'Patt – oavgjort.',
    'over.repetition': 'Oavgjort – samma ställning tre gånger.', 'over.fifty': 'Oavgjort – femtio drag utan slag eller bondedrag.',
    'over.material': 'Oavgjort – ingen kan ge matt.', 'over.draw': 'Oavgjort.',
    'over.again': 'Spela igen', 'over.menu': 'Till menyn',
    'promo.title': 'Bonden kom ända fram! Vad blir den?',
    'piece.k': 'Kung', 'piece.q': 'Dam', 'piece.r': 'Torn', 'piece.b': 'Löpare', 'piece.n': 'Springare', 'piece.p': 'Bonde',
    'help.title': 'Så spelar du',
    'help.1': '<b>Vanliga schackregler.</b> Gul (vit) börjar. Tryck på en snigel och sedan på rutan den ska krypa till. Lagliga rutor visas med prickar.',
    'help.2': '<b>Vem är vem:</b> hatten säger vilken pjäs snigeln är. Krona = kung, hög hatt = dam, keps = torn, vikingahjälm = springare, partyhatt = löpare, barhuvad = bonde. Märket i rutans hörn hjälper också.',
    'help.3': '<b>Slag:</b> den slagna snigeln drar sig in i skalet och lämnar brädet. Ingen skjuter i snällt schack. I <b>battle light</b> spelas slaget upp som en duell som anfallaren alltid vinner. I <b>battle</b> måste anfallaren träffa: miss = pjäsen står kvar och turen går över, och missar räddningsskottet när du står i schack faller kungen.',
    'help.4': '<b>Ångra</b> med ↶. Mot datorn tas både ditt och datorns drag tillbaka. Partiet sparas av sig självt, så du kan stänga och fortsätta senare.',
    'help.5': '<b>Kommer:</b> Kaos-läget där båda skjuter, och Snigelpost mot en kompis i egen takt.',
    'help.close': 'Stäng',
    'menu.mode': 'Spelläge', 'mode.gentle': 'Snällt schack – ingen skjuter', 'mode.battle': 'Battle light – slag avgörs i en duell',
    'duel.title': '{attacker} anfaller {defender}', 'duel.skip': 'Hoppa över', 'duel.salt': 'Saltet tog {name}!', 'duel.miss': '{name} missade!',
    'battle.miss': 'Missade! Pjäsen står kvar och turen går över.', 'over.kingLost': '{team} vinner – kungen föll när räddningsskottet missade.', 'moves.miss': 'miss',
    'mode.light': 'Battle light – slag avgörs i en duell, anfallaren vinner alltid',
    'msg.turn': '{name} siktar…', 'msg.cracked': '{name} sprack!', 'msg.drowned': '{name} drunknade!', 'msg.splash': 'Plums!',
    'msg.win': '{name} vann duellen', 'msg.draw': 'Båda borta…', 'msg.crateHealth': 'En låda faller', 'msg.crateWeapon': 'En låda faller', 'msg.heal': '{name} +35', 'msg.found': '{name} hittade något',
    'aria.mute': 'Ljud av', 'aria.unmute': 'Ljud på',
    'mate.banner': 'Schackmatt!', 'mate.replay': 'Repris av draget…', 'mate.tap': 'Tryck för att gå vidare',
    'mate.why': '{team} kung på {sq} står i schack från {attackers}. Kungen har ingen ruta att fly till (röda kryss), ingen pjäs kan slå angriparen och ingen kan ställa sig emellan.',
    'mate.attacker': '{piece} på {sq}', 'mate.and': ' och ', 'mate.skip': 'Hoppa över',
    'mate.ifKing': 'Går kungen till {sq} slår {attackers} den.', 'mate.ifKingStay': 'Kungen kan inte stå kvar heller: {attackers} hotar den.',
    'piece.k.def': 'kungen', 'piece.q.def': 'damen', 'piece.r.def': 'tornet', 'piece.b.def': 'löparen', 'piece.n.def': 'springaren', 'piece.p.def': 'bonden',
  },
  en: {
    'app.name': 'Snail Chess',
    'app.tagline': 'Chess with snails. The pieces crawl to their square. It takes as long as it takes.',
    'app.by': 'A <a href="https://knackpot.se" target="_blank" rel="noopener">Knackpot</a> product',
    'app.hub': 'More snail games at snails.se',
    'menu.opponent': 'Opponent',
    'opp.human': 'Two players, one device', 'opp.easy': 'Computer – easy', 'opp.normal': 'Computer – normal', 'opp.hard': 'Computer – hard',
    'menu.side': 'You play', 'side.w': 'Yellow (moves first)', 'side.b': 'Blue', 'side.random': 'Random',
    'menu.speed': 'Snail speed', 'speed.fast': 'Brisk, for a snail', 'speed.normal': 'Moderate', 'speed.snail': 'Proper snail',
    'menu.hints': 'Show legal moves', 'menu.badges': 'Piece badges on the squares', 'menu.flip': 'Turn the board towards the player to move',
    'menu.start': 'New game', 'menu.continue': 'Continue game', 'menu.help': 'How to play', 'menu.install': 'Install app',
    'menu.lang': 'Language', 'menu.offline': 'The game is saved for offline play.',
    'team.w': 'Yellow', 'team.b': 'Blue',
    'hud.turn': '{team} to move', 'hud.check': 'Check!', 'hud.thinking': 'The computer is thinking…', 'hud.ai': '(computer)',
    'aria.undo': 'Undo', 'aria.flip': 'Flip the board', 'aria.menu': 'Menu',
    'moves.title': 'Moves',
    'msg.inCheck': 'You are in check – save the king!',
    'over.title': 'Game over',
    'over.mate': '{team} wins – checkmate!', 'over.stalemate': 'Stalemate – a draw.',
    'over.repetition': 'Draw – the same position three times.', 'over.fifty': 'Draw – fifty moves without a capture or a pawn move.',
    'over.material': 'Draw – nobody can give mate.', 'over.draw': 'Draw.',
    'over.again': 'Play again', 'over.menu': 'Menu',
    'promo.title': 'The pawn made it all the way! What does it become?',
    'piece.k': 'King', 'piece.q': 'Queen', 'piece.r': 'Rook', 'piece.b': 'Bishop', 'piece.n': 'Knight', 'piece.p': 'Pawn',
    'help.title': 'How to play',
    'help.1': '<b>Ordinary chess rules.</b> Yellow (white) starts. Tap a snail, then the square it should crawl to. Legal squares are marked with dots.',
    'help.2': '<b>Who is who:</b> the hat tells you the piece. Crown = king, top hat = queen, cap = rook, viking helmet = knight, party hat = bishop, bare-headed = pawn. The badge in the corner of the square helps too.',
    'help.3': '<b>Captures:</b> the captured snail withdraws into its shell and leaves the board. Nobody shoots in gentle chess. In <b>battle light</b> the capture is played as a duel the attacker always wins. In <b>battle</b> the attacker must hit: a miss means the piece stays and the turn passes, and if the rescue shot misses while you are in check, the king falls.',
    'help.4': '<b>Undo</b> with ↶. Against the computer both your move and its reply are taken back. The game saves itself, so you can close and continue later.',
    'help.5': '<b>Coming:</b> Chaos mode where both shoot, and Snail Mail against a friend at your own pace.',
    'help.close': 'Close',
    'menu.mode': 'Game mode', 'mode.gentle': 'Gentle chess – nobody shoots', 'mode.battle': 'Battle light – captures are settled in a duel',
    'duel.title': '{attacker} attacks {defender}', 'duel.skip': 'Skip', 'duel.salt': 'The salt got {name}!', 'duel.miss': '{name} missed!',
    'battle.miss': 'Missed! The piece stays and the turn passes.', 'over.kingLost': '{team} wins – the king fell when the rescue shot missed.', 'moves.miss': 'miss',
    'mode.light': 'Battle light – captures are settled in a duel, the attacker always wins',
    'msg.turn': '{name} takes aim…', 'msg.cracked': '{name} cracked!', 'msg.drowned': '{name} drowned!', 'msg.splash': 'Splash!',
    'msg.win': '{name} won the duel', 'msg.draw': 'Both gone…', 'msg.crateHealth': 'A crate is falling', 'msg.crateWeapon': 'A crate is falling', 'msg.heal': '{name} +35', 'msg.found': '{name} found something',
    'aria.mute': 'Sound off', 'aria.unmute': 'Sound on',
    'mate.banner': 'Checkmate!', 'mate.replay': 'Replay of the move…', 'mate.tap': 'Tap to continue',
    'mate.why': 'The {team} king on {sq} is in check from {attackers}. The king has no square to run to (red crosses), no piece can capture the attacker and nothing can block.',
    'mate.attacker': '{piece} on {sq}', 'mate.and': ' and ', 'mate.skip': 'Skip',
    'mate.ifKing': 'If the king goes to {sq}, {attackers} takes it.', 'mate.ifKingStay': 'The king cannot stay either: {attackers} is attacking it.',
    'piece.k.def': 'the king', 'piece.q.def': 'the queen', 'piece.r.def': 'the rook', 'piece.b.def': 'the bishop', 'piece.n.def': 'the knight', 'piece.p.def': 'the pawn',
  },
};

let lang = 'sv';
export function detectLang() {
  try {
    const saved = localStorage.getItem('snailchess.lang');
    if (saved && dict[saved]) return saved;
  } catch { /* private mode */ }
  const q = new URLSearchParams(location.search).get('lang');
  if (q && dict[q]) return q;
  return (navigator.language || 'sv').toLowerCase().startsWith('sv') ? 'sv' : 'en';
}
export function getLang() { return lang; }
export function setLang(l) {
  lang = dict[l] ? l : 'sv';
  try { localStorage.setItem('snailchess.lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}
export function t(key, params = {}) {
  let s = dict[lang][key] ?? dict.sv[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}
export function keysOf(l) { return Object.keys(dict[l]); }
