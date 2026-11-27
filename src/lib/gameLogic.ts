// gameLogic — pure game state, word/question banks and GAME_META.
// Split out of GameComponents.tsx (Sat 28 Nov performance pass) so the
// DM + room pages can import the small helpers WITHOUT pulling the
// twelve game boards into the first-load bundle. The boards live in
// GameComponents.tsx and load on demand via GamePanel (next/dynamic).
// One source of truth — a fix here fixes both room and DM games.

const DRAW_WORDS: { w: string; hint: string }[] = [
  { w: 'cat', hint: 'animal' }, { w: 'dog', hint: 'animal' }, { w: 'butterfly', hint: 'animal' },
  { w: 'elephant', hint: 'animal' }, { w: 'fish', hint: 'animal' }, { w: 'bird', hint: 'animal' },
  { w: 'rabbit', hint: 'animal' }, { w: 'lion', hint: 'animal' }, { w: 'turtle', hint: 'animal' },
  { w: 'penguin', hint: 'animal' },
  { w: 'pizza', hint: 'food' }, { w: 'banana', hint: 'food' }, { w: 'cupcake', hint: 'food' },
  { w: 'apple', hint: 'food' }, { w: 'carrot', hint: 'food' }, { w: 'cake', hint: 'food' },
  { w: 'strawberry', hint: 'food' }, { w: 'cookie', hint: 'food' },
  { w: 'house', hint: 'thing' }, { w: 'car', hint: 'thing' }, { w: 'bicycle', hint: 'thing' },
  { w: 'sun', hint: 'thing' }, { w: 'moon', hint: 'thing' }, { w: 'star', hint: 'thing' },
  { w: 'umbrella', hint: 'thing' }, { w: 'key', hint: 'thing' }, { w: 'book', hint: 'thing' },
  { w: 'balloon', hint: 'thing' }, { w: 'chair', hint: 'thing' }, { w: 'tree', hint: 'thing' },
  { w: 'flower', hint: 'thing' }, { w: 'boat', hint: 'thing' }, { w: 'airplane', hint: 'thing' },
  { w: 'guitar', hint: 'thing' }, { w: 'hat', hint: 'thing' }, { w: 'clock', hint: 'thing' },
  { w: 'rainbow', hint: 'thing' }, { w: 'snowman', hint: 'thing' },
];

// Trivia Duel question bank: well-known, unambiguous facts only.
// `answer` is the index of the correct option.
// Wordle Duel — 100 common 5-letter words. The same list picks the
// duel word AND validates guesses (a guess must be in the list).
export const WORDLE_WORDS: string[] = [
  'APPLE','BEACH','BEARD','BEAST','BEGIN','BEING','BELLY','BENCH','BERRY','BIRTH',
  'BLACK','BLADE','BLAME','BLANK','BLAST','BLEND','BLESS','BLIND','BLOCK','BLOOD',
  'BOARD','BONUS','BOOKS','BOOST','BOOTH','BOUND','BRAIN','BRAND','BRAVE','BREAD',
  'BREAK','BREED','BRICK','BRIDE','BRIEF','BRING','BROAD','BROKE','BROOK','BROOM',
  'BROWN','BRUSH','BUDDY','BUILD','BUNCH','BURST','CAMEL','CANAL','CANDY','CANOE',
  'CARDS','CARGO','CARRY','CATCH','CAUSE','CHAIR','CHALK','CHAMP','CHARM','CHART',
  'CHASE','CHEAP','CHECK','CHEER','CHESS','CHEST','CHIEF','CHILD','CHILL','CHINA',
  'CHIPS','CHOSE','CHUNK','CIVIC','CLAIM','CLASS','CLEAN','CLEAR','CLERK','CLICK',
  'CLIFF','CLIMB','CLOCK','CLOSE','CLOTH','CLOUD','CLUBS','COACH','COAST','COINS',
  'COLOR','COMIC','COOKS','CORDS','COSTS','COUCH','COULD','COUNT','COVER','CRANE',
];

// Standard Wordle feedback with correct duplicate handling: greens
// first, then yellows only from the letters still unaccounted for.
export function wordleFeedback(guess: string, answer: string): ('correct' | 'present' | 'absent')[] {
  const res: ('correct' | 'present' | 'absent')[] = Array(5).fill('absent');
  const counts: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'correct') continue;
    if ((counts[guess[i]] || 0) > 0) { res[i] = 'present'; counts[guess[i]]--; }
  }
  return res;
}

const TRIVIA_BANK: { q: string; options: string[]; answer: number; cat: string }[] = [
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answer: 1, cat: 'Science' },
  { q: 'What is H2O commonly known as?', options: ['Salt', 'Oxygen', 'Water', 'Hydrogen'], answer: 2, cat: 'Science' },
  { q: 'How many legs does a spider have?', options: ['6', '8', '10', '4'], answer: 1, cat: 'Science' },
  { q: 'What force keeps us on the ground?', options: ['Magnetism', 'Friction', 'Inertia', 'Gravity'], answer: 3, cat: 'Science' },
  { q: 'What is the chemical symbol for gold?', options: ['Au', 'Ag', 'Gd', 'Go'], answer: 0, cat: 'Science' },
  { q: 'Which gas do plants absorb from the air?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], answer: 1, cat: 'Science' },
  { q: 'How many continents are there on Earth?', options: ['5', '6', '7', '8'], answer: 2, cat: 'Science' },
  { q: 'What is the largest organ of the human body?', options: ['Heart', 'Liver', 'Skin', 'Lung'], answer: 2, cat: 'Science' },
  { q: 'At what temperature (Celsius) does water boil at sea level?', options: ['90', '80', '120', '100'], answer: 3, cat: 'Science' },
  { q: 'Which animal is known as man\u2019s best friend?', options: ['Cat', 'Horse', 'Dog', 'Parrot'], answer: 2, cat: 'General Knowledge' },
  { q: 'What does HTTP stand for?', options: ['High Transfer Text Protocol', 'HyperText Transfer Protocol', 'HyperText Transmission Process', 'Home Tool Transfer Protocol'], answer: 1, cat: 'Tech' },
  { q: 'In which year was the first iPhone released?', options: ['2005', '2007', '2009', '2010'], answer: 1, cat: 'Tech' },
  { q: 'Who co-founded Microsoft with Bill Gates?', options: ['Steve Jobs', 'Jeff Bezos', 'Paul Allen', 'Elon Musk'], answer: 2, cat: 'Tech' },
  { q: 'What does CPU stand for?', options: ['Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit', 'Central Processing Unit'], answer: 3, cat: 'Tech' },
  { q: 'Which company makes the Android operating system?', options: ['Apple', 'Samsung', 'Google', 'Microsoft'], answer: 2, cat: 'Tech' },
  { q: 'What does "www" stand for?', options: ['World Web Window', 'Wide World Web', 'Web World Wide', 'World Wide Web'], answer: 3, cat: 'Tech' },
  { q: 'Which language is used to style web pages?', options: ['HTML', 'Python', 'CSS', 'SQL'], answer: 2, cat: 'Tech' },
  { q: 'How many bits are in one byte?', options: ['4', '16', '8', '32'], answer: 2, cat: 'Tech' },
  { q: 'What is the capital of France?', options: ['London', 'Berlin', 'Paris', 'Madrid'], answer: 2, cat: 'General Knowledge' },
  { q: 'How many days are there in a leap year?', options: ['365', '366', '364', '367'], answer: 1, cat: 'General Knowledge' },
  { q: 'Which is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3, cat: 'General Knowledge' },
  { q: 'How many sides does a hexagon have?', options: ['5', '7', '6', '8'], answer: 2, cat: 'General Knowledge' },
  { q: 'What is the largest hot desert in the world?', options: ['Gobi', 'Sahara', 'Arabian', 'Kalahari'], answer: 1, cat: 'General Knowledge' },
  { q: 'Which country is home to the kangaroo?', options: ['India', 'Brazil', 'Australia', 'Kenya'], answer: 2, cat: 'General Knowledge' },
  { q: 'How many minutes are in 2 hours?', options: ['60', '90', '180', '120'], answer: 3, cat: 'General Knowledge' },
  { q: 'What colour do you get by mixing blue and yellow paint?', options: ['Purple', 'Orange', 'Green', 'Brown'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which movie features a ship called the Titanic?', options: ['Avatar', 'Titanic', 'Jaws', 'Moana'], answer: 1, cat: 'Movies' },
  { q: 'Who directed the movie "Jaws"?', options: ['Christopher Nolan', 'James Cameron', 'Steven Spielberg', 'Quentin Tarantino'], answer: 2, cat: 'Movies' },
  { q: 'Which animated film features a snowman named Olaf?', options: ['Moana', 'Tangled', 'Frozen', 'Brave'], answer: 2, cat: 'Movies' },
  { q: 'What is the name of the cowboy in Toy Story?', options: ['Buzz', 'Rex', 'Woody', 'Slinky'], answer: 2, cat: 'Movies' },
  { q: 'Which movie is about a lion cub named Simba?', options: ['Madagascar', 'The Lion King', 'Zootopia', 'Bambi'], answer: 1, cat: 'Movies' },
  { q: 'In which movie would you hear "May the Force be with you"?', options: ['Star Trek', 'Avatar', 'Dune', 'Star Wars'], answer: 3, cat: 'Movies' },
  // Expansion 2026-11-15: 32 -> 72 questions. Same rules: well-known,
  // timeless facts only, exactly one correct option, no duplicates.
  // Categories are rendered generically (a pill with the cat string),
  // so the two new categories below need no other code change.
  { q: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Earth', 'Mars'], answer: 1, cat: 'Science' },
  { q: 'What is known as the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], answer: 2, cat: 'Science' },
  { q: 'How many bones are in the adult human body?', options: ['206', '196', '216', '186'], answer: 0, cat: 'Science' },
  { q: 'Which organ pumps blood around the human body?', options: ['Liver', 'Lung', 'Kidney', 'Heart'], answer: 3, cat: 'Science' },
  { q: 'Which gas makes up most of the air we breathe?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], answer: 1, cat: 'Science' },
  { q: 'How many hearts does an octopus have?', options: ['1', '2', '3', '4'], answer: 2, cat: 'Science' },
  { q: 'What is the fastest land animal?', options: ['Cheetah', 'Lion', 'Horse', 'Gazelle'], answer: 0, cat: 'Science' },
  { q: 'Which part of a plant makes food using sunlight?', options: ['Root', 'Stem', 'Flower', 'Leaf'], answer: 3, cat: 'Science' },
  { q: 'What does RAM stand for?', options: ['Read Access Memory', 'Random Access Memory', 'Rapid Action Machine', 'Run All Memory'], answer: 1, cat: 'Tech' },
  { q: 'Which company created the iPhone?', options: ['Samsung', 'Google', 'Microsoft', 'Apple'], answer: 3, cat: 'Tech' },
  { q: 'What does AI stand for?', options: ['Automated Intelligence', 'Advanced Internet', 'Artificial Intelligence', 'Apple Intelligence'], answer: 2, cat: 'Tech' },
  { q: 'In which year was the World Wide Web invented?', options: ['1989', '1979', '1995', '2001'], answer: 0, cat: 'Tech' },
  { q: 'Which of these is a web browser?', options: ['Microsoft Word', 'Google Chrome', 'Adobe Photoshop', 'Spotify'], answer: 1, cat: 'Tech' },
  { q: 'What does USB stand for?', options: ['United System Board', 'Universal Storage Box', 'Ultra Speed Band', 'Universal Serial Bus'], answer: 3, cat: 'Tech' },
  { q: 'Who co-founded Apple with Steve Jobs?', options: ['Bill Gates', 'Steve Wozniak', 'Elon Musk', 'Jeff Bezos'], answer: 1, cat: 'Tech' },
  { q: 'How many colours are in a rainbow?', options: ['5', '6', '8', '7'], answer: 3, cat: 'General Knowledge' },
  { q: 'What is the largest mammal in the world?', options: ['Elephant', 'Blue whale', 'Giraffe', 'Hippopotamus'], answer: 1, cat: 'General Knowledge' },
  { q: 'How many seconds are in one minute?', options: ['30', '90', '60', '100'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which instrument has 88 keys?', options: ['Guitar', 'Violin', 'Flute', 'Piano'], answer: 3, cat: 'General Knowledge' },
  { q: 'What is the main language spoken in Brazil?', options: ['Spanish', 'French', 'Portuguese', 'Italian'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which season comes after summer?', options: ['Winter', 'Autumn', 'Spring', 'Monsoon'], answer: 1, cat: 'General Knowledge' },
  { q: 'What do caterpillars turn into?', options: ['Butterflies', 'Bees', 'Ants', 'Flies'], answer: 0, cat: 'General Knowledge' },
  { q: 'Which movie features a clownfish named Nemo?', options: ['Up', 'Finding Nemo', 'Inside Out', 'Coco'], answer: 1, cat: 'Movies' },
  { q: 'Who plays Jack Sparrow in Pirates of the Caribbean?', options: ['Brad Pitt', 'Leonardo DiCaprio', 'Tom Cruise', 'Johnny Depp'], answer: 3, cat: 'Movies' },
  { q: 'In the movie Frozen, what is the name of Elsa\u2019s sister?', options: ['Moana', 'Rapunzel', 'Anna', 'Merida'], answer: 2, cat: 'Movies' },
  { q: 'What is the name of the school in Harry Potter?', options: ['Hogwarts', 'Narnia', 'Middle-earth', 'Wonderland'], answer: 0, cat: 'Movies' },
  { q: 'Which movie features a robot named WALL-E?', options: ['Robots', 'Big Hero 6', 'Toy Story', 'WALL-E'], answer: 3, cat: 'Movies' },
  { q: 'What is the capital of Japan?', options: ['Seoul', 'Beijing', 'Bangkok', 'Tokyo'], answer: 3, cat: 'Geography' },
  { q: 'What is the capital of Australia?', options: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], answer: 1, cat: 'Geography' },
  { q: 'Which is the largest country in the world by area?', options: ['China', 'USA', 'Canada', 'Russia'], answer: 3, cat: 'Geography' },
  { q: 'What is the capital of Canada?', options: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], answer: 1, cat: 'Geography' },
  { q: 'On which continent is the Sahara Desert?', options: ['Asia', 'Australia', 'Africa', 'South America'], answer: 2, cat: 'Geography' },
  { q: 'Mount Everest sits on the border of Nepal and which other country?', options: ['India', 'Bhutan', 'China', 'Pakistan'], answer: 2, cat: 'Geography' },
  { q: 'Which ocean lies between Europe and North America?', options: ['Atlantic', 'Pacific', 'Indian', 'Arctic'], answer: 0, cat: 'Geography' },
  { q: 'In which sport would you perform a slam dunk?', options: ['Tennis', 'Golf', 'Basketball', 'Cricket'], answer: 2, cat: 'Sports' },
  { q: 'How many players are on a football (soccer) team on the field?', options: ['9', '11', '10', '12'], answer: 1, cat: 'Sports' },
  { q: 'In tennis, what is a score of zero called?', options: ['Duck', 'Nil', 'Blank', 'Love'], answer: 3, cat: 'Sports' },
  { q: 'Which sport uses a shuttlecock?', options: ['Badminton', 'Squash', 'Table tennis', 'Volleyball'], answer: 0, cat: 'Sports' },
  { q: 'How often are the Summer Olympic Games held?', options: ['Every 2 years', 'Every 4 years', 'Every 3 years', 'Every 5 years'], answer: 1, cat: 'Sports' },
  { q: 'In which sport is the Davis Cup competed for?', options: ['Golf', 'Cricket', 'Tennis', 'Rugby'], answer: 2, cat: 'Sports' },
];

export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Replay one drawing stroke onto a canvas context.
export function drawStrokeOn(ctx: CanvasRenderingContext2D, s: any) {
  const pts: number[][] = s.points || [];
  if (pts.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size || 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], (s.size || 6) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// Crazy Eights helpers: cards are 'AS', '10H', '8D' — rank + suit letter.
// Suits: S spades, H hearts, D diamonds, C clubs.
const CE_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const CE_SUITS = ['S','H','D','C'] as const;
export const CE_SUIT_SYMBOL: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };
export const CE_SUIT_NAME: Record<string,string> = { S:'Spades', H:'Hearts', D:'Diamonds', C:'Clubs' };
export function ceRank(card: string): string { return card.slice(0, -1); }
export function ceSuit(card: string): string { return card.slice(-1); }
export function ceIsRed(card: string): boolean { const s = ceSuit(card); return s === 'H' || s === 'D'; }
function ceNewDeck(): string[] {
  const d: string[] = [];
  for (const s of CE_SUITS) for (const r of CE_RANKS) d.push(r + s);
  return shuffled(d);
}
export function cePlayable(card: string, top: string, currentSuit: string): boolean {
  if (!top) return true;
  return ceRank(card) === '8' || ceRank(card) === ceRank(top) || ceSuit(card) === currentSuit;
}

// Deal 7 cards to a player who has no hand yet (the second player
// joining, or a rematch). Never deals a third hand — the game is
// strictly two players.
export function dealCrazyEights(st: any, userId: string): any {
  const hands: Record<string, string[]> = { ...(st.hands || {}) };
  if (hands[userId]) return st;
  if (Object.keys(hands).length >= 2) return st;
  const deck: string[] = [...(st.deck || [])];
  if (deck.length < 7) return st;
  hands[userId] = deck.splice(0, 7);
  return { ...st, hands, deck };
}

// Checkers — 8x8, 12 pieces each. A board cell holds { side, king } or
// null; side 0 sits at the bottom (rows 5-7) and moves up, side 1 sits
// at the top (rows 0-2) and moves down. seats[0] is the creator
// (bottom), seats[1] the joining player (top, null until they join —
// joinGame fills it via seatCheckersPlayer). Pieces move one diagonal
// step forward; jumps capture the jumped piece and are mandatory; a
// jump that opens another jump from the landing square must continue
// (mustJumpFrom). Reaching the far row crowns a king (kings move both
// ways) and ends the turn. Win: the opponent has no pieces left or no
// legal moves. Pure helpers — the verify script runs them in node.
export interface CheckersMove { from: number; to: number; captured: number | null; }
function ckRow(i: number): number { return Math.floor(i / 8); }
function ckCol(i: number): number { return i % 8; }
function ckIdx(r: number, c: number): number { return r * 8 + c; }
function ckOnBoard(r: number, c: number): boolean { return r >= 0 && r < 8 && c >= 0 && c < 8; }
// Which side a player sits on: 0 = seats[0] (creator, bottom),
// 1 = seats[1] (top). Null when the player is not seated (yet).
export function checkersSideOf(state: any, playerId: string): 0 | 1 | null {
  if (!state || !playerId) return null;
  if (state.seats?.[0] === playerId) return 0;
  if (state.seats?.[1] === playerId) return 1;
  return null;
}
export function checkersLegalMoves(board: any[], side: 0 | 1, mustJumpFrom: number | null): CheckersMove[] {
  const jumps: CheckersMove[] = [];
  const steps: CheckersMove[] = [];
  // Mid multi-jump: only the jumping piece may move, and only to jump.
  const froms = mustJumpFrom !== null && mustJumpFrom !== undefined
    ? [mustJumpFrom]
    : board.map((cell, i) => (cell && cell.side === side ? i : -1)).filter((i) => i >= 0);
  for (const from of froms) {
    const cell = board[from];
    if (!cell || cell.side !== side) continue;
    const r = ckRow(from), c = ckCol(from);
    const dirs = cell.king ? [-1, 1] : [side === 0 ? -1 : 1];
    for (const dr of dirs) {
      for (const dc of [-1, 1]) {
        const r1 = r + dr, c1 = c + dc;
        if (!ckOnBoard(r1, c1)) continue;
        const adj = board[ckIdx(r1, c1)];
        if (!adj) {
          if (mustJumpFrom === null || mustJumpFrom === undefined) steps.push({ from, to: ckIdx(r1, c1), captured: null });
        } else if (adj.side !== side) {
          const r2 = r + 2 * dr, c2 = c + 2 * dc;
          if (ckOnBoard(r2, c2) && !board[ckIdx(r2, c2)]) jumps.push({ from, to: ckIdx(r2, c2), captured: ckIdx(r1, c1) });
        }
      }
    }
  }
  // Captures are mandatory: if any jump exists, plain steps are illegal.
  return jumps.length > 0 ? jumps : steps;
}
export function checkersCountPieces(board: any[], side: 0 | 1): number {
  return board.filter((cell) => cell && cell.side === side).length;
}
// Apply one legal move and return the new state, or null when the move
// is illegal (wrong turn, not your piece, not a legal destination).
// The mover's id comes from state.turn; seats map sides to players.
export function applyCheckersMove(state: any, from: number, to: number): any | null {
  if (!state || !state.board || !state.seats) return null;
  const mover = state.turn;
  const side = checkersSideOf(state, mover);
  if (side === null) return null;
  const legal = checkersLegalMoves(state.board, side, state.mustJumpFrom ?? null);
  const move = legal.find((m) => m.from === from && m.to === to);
  if (!move) return null;
  const board = [...state.board];
  const piece = { ...(board[from] as { side: 0 | 1; king: boolean }) };
  board[from] = null;
  if (move.captured !== null) board[move.captured] = null;
  // Crowned on the far row — and a crowned piece's turn ends, even
  // mid-jump (standard American checkers rule).
  const crowned = !piece.king && ((side === 0 && ckRow(to) === 0) || (side === 1 && ckRow(to) === 7));
  if (crowned) piece.king = true;
  board[to] = piece;
  const captured = { ...(state.captured || {}) };
  if (move.captured !== null) captured[mover] = (captured[mover] || 0) + 1;
  const next: any = { ...state, board, captured, lastMove: { from, to } };
  const otherSide = (side === 0 ? 1 : 0) as 0 | 1;
  const otherId = state.seats[otherSide];
  // Multi-jump: the same piece jumps again while another capture is open.
  if (move.captured !== null && !crowned) {
    const again = checkersLegalMoves(board, side, to);
    if (again.length > 0) {
      next.mustJumpFrom = to;
      return next; // turn stays with the mover
    }
  }
  next.mustJumpFrom = null;
  // Win: the opponent has no pieces left, or no legal move on their
  // turn. (No second player seated yet means no win check — a game
  // cannot be played before both are in anyway.)
  if (otherId) {
    const oppPieces = checkersCountPieces(board, otherSide);
    const oppMoves = checkersLegalMoves(board, otherSide, null);
    if (oppPieces === 0 || oppMoves.length === 0) {
      next.phase = 'finished';
      next.winner = mover;
    } else {
      next.turn = otherId;
    }
  }
  return next;
}
export function checkersNewBoard(creatorId: string, otherId?: string | null): any {
  const board: any[] = Array(64).fill(null);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r * 8 + c] = { side: 1, king: false };
  for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[r * 8 + c] = { side: 0, king: false };
  return { phase: 'playing', board, seats: [creatorId, otherId || null], turn: creatorId, winner: null, captured: {}, mustJumpFrom: null, lastMove: null };
}
// Seat the joining player on the top rows (side 1). Never seats a
// third player and never re-seats once filled.
export function seatCheckersPlayer(st: any, userId: string): any {
  const seats = [...(st.seats || [null, null])];
  if (!seats[1] && seats[0] !== userId) seats[1] = userId;
  return { ...st, seats };
}

// Categories — one letter, five categories, 60 seconds. Each player
// types one answer per category; an answer scores only when its first
// letter matches the game letter (case-insensitive). No dictionary:
// any word starting with the letter counts. Most valid answers wins;
// a tie is a draw. Letters Q, X and Z are excluded — answers must be
// findable. Pure helpers — the verify script runs them in node, like
// the checkers helpers.
export const CATEGORIES_DURATION_MS = 60000;
export const CATEGORIES_LETTERS: string[] = 'ABCDEFGHIJKLMNOPRSTUVWY'.split('');
export const CATEGORIES_BANK: string[] = [
  'Animal', 'Food', 'Country', 'Movie', 'Name', 'Colour',
  'Sport', 'Job', 'Fruit', 'City', 'Song', 'Book',
];
// Draw the game: one random letter + 5 random categories from the bank.
export function categoriesPick(): { letter: string; categories: string[] } {
  const letter = CATEGORIES_LETTERS[Math.floor(Math.random() * CATEGORIES_LETTERS.length)];
  return { letter, categories: shuffled(CATEGORIES_BANK).slice(0, 5) };
}
// One answer is valid when it is non-empty and starts with the letter.
export function categoriesValidAnswer(answer: string, letter: string): boolean {
  const a = (answer || '').trim();
  if (!a || !letter) return false;
  return a[0].toUpperCase() === letter.toUpperCase();
}
// Score a player's answers ({ category: answer }) against the letter.
export function categoriesScore(answers: Record<string, string>, letter: string): number {
  if (!answers || !letter) return 0;
  return Object.values(answers).filter((a) => categoriesValidAnswer(a, letter)).length;
}
// Count how many categories a player has answered (non-empty), for the
// opponent-progress line — counts only, never their answers.
export function categoriesAnsweredCount(answers: Record<string, string>): number {
  if (!answers) return 0;
  return Object.values(answers).filter((a) => (a || '').trim() !== '').length;
}

export function initialStateFor(type: string, creatorId: string, otherId?: string | null): any {
  if (type === 'tictactoe') return { board: Array(9).fill(null), currentPlayer: creatorId, playerX: creatorId, playerO: null, winner: null };
  if (type === 'rps') return { choices: {}, winner: null, round: 1 };
  if (type === 'number-guess') return { phase: 'choose', setterId: null, guesserId: null, secret: null, guesses: [], winner: null };
  if (type === 'hangman') return { phase: 'choose', setterId: null, guesserId: null, word: null, guessed: [], wrongGuesses: [], maxWrong: 6, winner: null };
  if (type === 'draw-guess') return { phase: 'playing', round: 1, totalRounds: 4, drawerId: creatorId, words: shuffled(DRAW_WORDS).slice(0, 4), scores: {}, guesses: [], strokes: [], roundEndsAt: null, roundResult: null, winner: null };
  if (type === 'trivia') return { phase: 'playing', qi: 0, questions: shuffled(TRIVIA_BANK).slice(0, 5), answers: {}, scores: {}, lastPoints: {}, questionEndsAt: null, winner: null };
  if (type === 'dots-boxes') return { phase: 'playing', turn: creatorId, edges: {}, boxes: {}, scores: {}, lastMoveBy: null, lastClaimed: 0, winner: null };
  if (type === 'crazy-eights') {
    const deck = ceNewDeck();
    const hands: Record<string, string[]> = { [creatorId]: deck.splice(0, 7) };
    // The first discard must not be an 8: cycle 8s to the bottom.
    let top = deck.shift()!;
    while (ceRank(top) === '8') { deck.push(top); top = deck.shift()!; }
    return { phase: 'playing', deck, hands, discard: [top], currentSuit: ceSuit(top), turn: creatorId, winner: null };
  }
  if (type === 'wordle') return { phase: 'playing', word: WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)], guesses: {}, done: {}, winner: null };
  if (type === 'checkers') return checkersNewBoard(creatorId, otherId);
  if (type === 'categories') {
    const pick = categoriesPick();
    // endsAt is null until BOTH players are in — either client arms the
    // 60s timer then (same arm pattern as Trivia's questionEndsAt), so
    // the clock never runs while the second player is still joining.
    return { phase: 'playing', letter: pick.letter, categories: pick.categories, answers: {}, done: {}, scores: {}, endsAt: null, winner: null };
  }
  if (type === 'simon-says') {
    // Simon Says — both players repeat the SAME growing pattern.
    // The pattern starts at one pad and grows by one each round both
    // players complete. progress/alive/done/streak are keyed by
    // player id and start empty: the RPC fills them in (a missing key
    // means "has not acted yet" — alive, not done, 0 progress).
    return { phase: 'playing', pattern: [Math.floor(Math.random() * 4)], round: 1, progress: {}, alive: {}, done: {}, streak: {}, winner: null };
  }
  return {};
}


export const GAME_META: Record<string,{emoji:string;name:string;desc:string}> = {
  'tictactoe': { emoji:'⭕', name:'Tic Tac Toe', desc:'2 players' },
  'rps': { emoji:'✊', name:'Rock Paper Scissors', desc:'2 players' },
  'number-guess': { emoji:'🔢', name:'Number Guess', desc:'2 players' },
  'hangman': { emoji:'🔡', name:'Hangman', desc:'2 players' },
  'draw-guess': { emoji:'🎨', name:'Draw & Guess', desc:'2 players' },
  'trivia': { emoji:'🧠', name:'Trivia Duel', desc:'2 players' },
  'dots-boxes': { emoji:'🔲', name:'Dots & Boxes', desc:'2 players' },
  'crazy-eights': { emoji:'🃏', name:'Crazy Eights', desc:'2 players' },
  'wordle': { emoji:'🟩', name:'Wordle Duel', desc:'2 players' },
  'checkers': { emoji:'🔴', name:'Checkers', desc:'2 players' },
  'categories': { emoji:'🔤', name:'Categories', desc:'2 players' },
  'simon-says': { emoji:'🎵', name:'Simon Says', desc:'2 players' },
};

export function restartStateFor(game: any, gameState: any): any {
  const fresh = initialStateFor(game.type, game.created_by);
  if (game.type === 'tictactoe' && gameState) {
    fresh.playerX = gameState.playerX || game.created_by;
    fresh.playerO = gameState.playerO || null;
    fresh.currentPlayer = fresh.playerX;
  }
  if (game.type === 'rps' && gameState) fresh.round = (gameState.round || 1) + 1;
  if (game.type === 'checkers' && gameState) {
    // Re-seat the second player from the old game, so a rematch keeps
    // both seats; the board itself is a fresh deal.
    return initialStateFor(game.type, game.created_by, gameState.seats?.[1] || undefined);
  }
  if (game.type === 'crazy-eights' && gameState) {
    // Re-deal the second player from the fresh deck, as the room restart does.
    const prevHands = (gameState.hands || {}) as Record<string, string[]>;
    let next = fresh;
    for (const pid of Object.keys(prevHands)) {
      if (pid !== game.created_by) next = dealCrazyEights(next, pid);
    }
    return next;
  }
  return fresh;
}
