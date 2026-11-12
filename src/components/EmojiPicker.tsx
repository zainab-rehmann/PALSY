'use client';

import { useRef, useState } from 'react';

// Emoji panel for the chat composer — tap an emoji to insert it
// into the message being typed. Ten groups with jump-to tabs and a
// name search, WhatsApp-style. Solid theme colours only, like the
// rest of PALSY. The parent owns open/close; this panel only calls
// onPick. (The Enter key in the search box must not submit the
// composer's form, so it is swallowed.)

type EmojiEntry = { e: string; n: string };
type Group = { id: string; label: string; icon: string; emojis: EmojiEntry[] };

const GROUPS: Group[] = [
  {
    id: 'smileys', label: 'Smileys', icon: '😊',
    emojis: [
      { e: '😊', n: 'smiling face happy' }, { e: '😂', n: 'face tears joy laugh funny' },
      { e: '🤣', n: 'rolling floor laughing' }, { e: '😍', n: 'heart eyes love' },
      { e: '🥰', n: 'smiling face hearts love' }, { e: '😘', n: 'blowing kiss' },
      { e: '😗', n: 'kissing face' }, { e: '😙', n: 'kissing smiling eyes' },
      { e: '😚', n: 'kissing closed eyes' }, { e: '🤗', n: 'hugging hug' },
      { e: '🥺', n: 'pleading puppy eyes please' }, { e: '😭', n: 'loudly crying sob' },
      { e: '😢', n: 'crying tear sad' }, { e: '🥹', n: 'holding back tears emotional' },
      { e: '😴', n: 'sleeping sleepy tired' }, { e: '🤔', n: 'thinking think hmm' },
      { e: '🤨', n: 'raised eyebrow suspicious' }, { e: '😎', n: 'sunglasses cool' },
      { e: '🥸', n: 'disguised glasses moustache' }, { e: '🤩', n: 'star struck wow amazed' },
      { e: '😋', n: 'yummy face tongue delicious' }, { e: '😜', n: 'winking tongue silly' },
      { e: '🤪', n: 'zany crazy face' }, { e: '😝', n: 'squinting tongue' },
      { e: '🙃', n: 'upside down silly' }, { e: '😇', n: 'halo angel innocent' },
      { e: '😈', n: 'devil evil naughty' }, { e: '😉', n: 'winking wink' },
      { e: '😌', n: 'relieved calm peaceful' }, { e: '😔', n: 'pensive sad' },
      { e: '😞', n: 'disappointed sad' }, { e: '😟', n: 'worried concerned' },
      { e: '😤', n: 'steam nose angry frustrated' }, { e: '😡', n: 'angry rage mad' },
      { e: '🤯', n: 'exploding head mind blown shocked' }, { e: '🥳', n: 'partying celebrate birthday' },
      { e: '🫠', n: 'melting face hot embarrassed' }, { e: '🫡', n: 'saluting salute respect' },
      { e: '🤫', n: 'shushing quiet secret' }, { e: '🫣', n: 'peeking face shy' },
      { e: '🤭', n: 'giggling hand over mouth' }, { e: '😶', n: 'face without mouth speechless' },
      { e: '😶‍🌫️', n: 'face in clouds confused' }, { e: '🫥', n: 'dotted line face invisible' },
      { e: '😵', n: 'dizzy face dead' }, { e: '🤐', n: 'zipper mouth secret quiet' },
      { e: '🤑', n: 'money face rich' },
      { e: '😺', n: 'smiling cat happy' }, { e: '😸', n: 'grinning cat' },
      { e: '😹', n: 'cat tears joy laugh' }, { e: '😻', n: 'heart eyes cat love' },
      { e: '😼', n: 'smirking cat smug' }, { e: '😽', n: 'kissing cat' },
      { e: '🙀', n: 'weary cat shocked' }, { e: '😿', n: 'crying cat sad' },
      { e: '😾', n: 'pouting cat grumpy' },
    ],
  },
  {
    id: 'hearts', label: 'Hearts', icon: '💕',
    emojis: [
      { e: '❤️', n: 'red heart love' }, { e: '🧡', n: 'orange heart' },
      { e: '💛', n: 'yellow heart' }, { e: '💚', n: 'green heart' },
      { e: '💙', n: 'blue heart' }, { e: '💜', n: 'purple heart' },
      { e: '🖤', n: 'black heart' }, { e: '🤍', n: 'white heart' },
      { e: '🤎', n: 'brown heart' }, { e: '🩷', n: 'pink heart' },
      { e: '🩵', n: 'light blue heart' }, { e: '🩶', n: 'grey heart gray' },
      { e: '💕', n: 'two hearts love' }, { e: '💖', n: 'sparkling heart' },
      { e: '💗', n: 'growing heart' }, { e: '💓', n: 'beating heart' },
      { e: '💘', n: 'cupid arrow heart' }, { e: '💝', n: 'heart gift box' },
      { e: '💞', n: 'revolving hearts' }, { e: '💔', n: 'broken heart sad' },
      { e: '❣️', n: 'heart exclamation' }, { e: '💟', n: 'heart decoration' },
      { e: '♥️', n: 'heart suit cards' }, { e: '💌', n: 'love letter mail' },
      { e: '💋', n: 'kiss lips mark' }, { e: '🫶', n: 'heart hands love' },
      { e: '💐', n: 'bouquet flowers' }, { e: '🌹', n: 'rose flower love' },
      { e: '🥀', n: 'wilted flower rose' }, { e: '🌷', n: 'tulip flower' },
      { e: '🌸', n: 'cherry blossom flower' }, { e: '💒', n: 'wedding chapel church' },
    ],
  },
  {
    id: 'hands', label: 'Hands', icon: '👋',
    emojis: [
      { e: '👋', n: 'waving hand hello bye' }, { e: '🤚', n: 'raised back hand' },
      { e: '✋', n: 'raised hand stop high five' }, { e: '🖐️', n: 'hand fingers splayed' },
      { e: '👌', n: 'ok hand perfect' }, { e: '🤌', n: 'pinched fingers chef kiss' },
      { e: '✌️', n: 'peace victory sign' }, { e: '🤞', n: 'crossed fingers luck hope' },
      { e: '🫰', n: 'hand heart fingers korean' }, { e: '🤟', n: 'love you sign rock' },
      { e: '🤘', n: 'horns rock metal' }, { e: '🤙', n: 'call me shaka hang loose' },
      { e: '👈', n: 'pointing left' }, { e: '👉', n: 'pointing right' },
      { e: '👆', n: 'pointing up' }, { e: '👇', n: 'pointing down' },
      { e: '☝️', n: 'index pointing up' }, { e: '👍', n: 'thumbs up like good' },
      { e: '👎', n: 'thumbs down bad' }, { e: '👏', n: 'clapping hands applause' },
      { e: '🙌', n: 'raising hands hooray praise' }, { e: '👐', n: 'open hands hug' },
      { e: '🤲', n: 'palms up together dua' }, { e: '🙏', n: 'folded hands pray thanks please' },
      { e: '💪', n: 'flexed biceps strong muscle' }, { e: '🫵', n: 'pointing at you' },
      { e: '✍️', n: 'writing hand pen' }, { e: '👊', n: 'fist bump oncoming' },
      { e: '✊', n: 'raised fist power' }, { e: '🤛', n: 'fist left bump' },
      { e: '🤜', n: 'fist right bump' },
    ],
  },
  {
    id: 'animals', label: 'Animals', icon: '🐱',
    emojis: [
      { e: '🐱', n: 'cat face kitten' }, { e: '🐶', n: 'dog face puppy' },
      { e: '🐭', n: 'mouse face' }, { e: '🐹', n: 'hamster face' },
      { e: '🐰', n: 'rabbit bunny face' }, { e: '🦊', n: 'fox face' },
      { e: '🐻', n: 'bear face' }, { e: '🐼', n: 'panda face' },
      { e: '🐨', n: 'koala face' }, { e: '🐯', n: 'tiger face' },
      { e: '🦁', n: 'lion face' }, { e: '🐮', n: 'cow face' },
      { e: '🐷', n: 'pig face' }, { e: '🐸', n: 'frog face' },
      { e: '🐵', n: 'monkey face' }, { e: '🙈', n: 'see no evil monkey' },
      { e: '🙉', n: 'hear no evil monkey' }, { e: '🙊', n: 'speak no evil monkey' },
      { e: '🐔', n: 'chicken' }, { e: '🐧', n: 'penguin' },
      { e: '🐦', n: 'bird' }, { e: '🐤', n: 'baby chick' },
      { e: '🦄', n: 'unicorn magical' }, { e: '🐝', n: 'bee honey' },
      { e: '🦋', n: 'butterfly' }, { e: '🐢', n: 'turtle' },
      { e: '🐙', n: 'octopus' }, { e: '🐳', n: 'whale spouting' },
      { e: '🦖', n: 'dinosaur t rex' }, { e: '🐲', n: 'dragon face' },
      { e: '🦉', n: 'owl wise' }, { e: '🐞', n: 'ladybug ladybird' },
      { e: '🐠', n: 'tropical fish' }, { e: '🐬', n: 'dolphin' },
      { e: '🦭', n: 'seal' }, { e: '🦩', n: 'flamingo' },
      { e: '🦚', n: 'peacock' }, { e: '🐿️', n: 'squirrel chipmunk' },
      { e: '🦔', n: 'hedgehog' },
      { e: '🌻', n: 'sunflower' }, { e: '🌼', n: 'blossom flower' },
      { e: '🌿', n: 'herb leaf' }, { e: '🍀', n: 'four leaf clover lucky' },
      { e: '🌈', n: 'rainbow' }, { e: '☀️', n: 'sun sunny' },
      { e: '🌙', n: 'crescent moon night' }, { e: '⭐', n: 'star' },
      { e: '☁️', n: 'cloud' }, { e: '❄️', n: 'snowflake winter cold' },
      { e: '🔥', n: 'fire flame hot lit' },
    ],
  },
  {
    id: 'food', label: 'Food', icon: '🍓',
    emojis: [
      { e: '🍓', n: 'strawberry berry' }, { e: '🍇', n: 'grapes' },
      { e: '🍉', n: 'watermelon' }, { e: '🍊', n: 'orange tangerine' },
      { e: '🍋', n: 'lemon' }, { e: '🍌', n: 'banana' },
      { e: '🍎', n: 'red apple' }, { e: '🍏', n: 'green apple' },
      { e: '🍑', n: 'peach' }, { e: '🍒', n: 'cherries' },
      { e: '🥭', n: 'mango' }, { e: '🍍', n: 'pineapple' },
      { e: '🥝', n: 'kiwi fruit' }, { e: '🍅', n: 'tomato' },
      { e: '🥑', n: 'avocado' }, { e: '🍔', n: 'burger hamburger' },
      { e: '🍟', n: 'fries french fries' }, { e: '🍕', n: 'pizza slice' },
      { e: '🌮', n: 'taco' }, { e: '🍜', n: 'noodles ramen bowl' },
      { e: '🍣', n: 'sushi' }, { e: '🍩', n: 'donut doughnut' },
      { e: '🍪', n: 'cookie biscuit' }, { e: '🍰', n: 'cake slice shortcake' },
      { e: '🎂', n: 'birthday cake' }, { e: '🍫', n: 'chocolate bar' },
      { e: '🍦', n: 'ice cream soft serve' }, { e: '🍧', n: 'shaved ice dessert' },
      { e: '🧁', n: 'cupcake muffin' }, { e: '☕', n: 'coffee hot drink' },
      { e: '🧋', n: 'bubble tea boba milk tea' }, { e: '🥤', n: 'cup straw drink soda' },
      { e: '🧃', n: 'juice box drink' }, { e: '🍵', n: 'tea cup matcha' },
      { e: '🥛', n: 'milk glass' }, { e: '🍯', n: 'honey pot' },
    ],
  },
  {
    id: 'activities', label: 'Fun', icon: '🎉',
    emojis: [
      { e: '⚽', n: 'soccer football ball' }, { e: '🏀', n: 'basketball' },
      { e: '🏈', n: 'american football' }, { e: '⚾', n: 'baseball' },
      { e: '🎾', n: 'tennis' }, { e: '🏐', n: 'volleyball' },
      { e: '🏸', n: 'badminton shuttlecock' }, { e: '🏓', n: 'ping pong table tennis' },
      { e: '🏏', n: 'cricket bat ball' }, { e: '⛳', n: 'golf flag hole' },
      { e: '🏊', n: 'swimming swimmer' }, { e: '🚴', n: 'cycling bike cyclist' },
      { e: '🧘', n: 'yoga meditation lotus' }, { e: '🎮', n: 'video game controller gaming' },
      { e: '🎲', n: 'dice game' }, { e: '🧩', n: 'puzzle piece' },
      { e: '🎯', n: 'target darts bullseye' }, { e: '🎨', n: 'art palette painting' },
      { e: '🎭', n: 'theatre drama masks' }, { e: '🎤', n: 'microphone karaoke sing' },
      { e: '🎧', n: 'headphones music' }, { e: '🎵', n: 'music note song' },
      { e: '🎶', n: 'music notes melody' }, { e: '🎹', n: 'piano keyboard' },
      { e: '🎸', n: 'guitar' }, { e: '🥁', n: 'drum' },
      { e: '🎉', n: 'party popper celebrate tada' }, { e: '🎊', n: 'confetti ball party' },
      { e: '🎁', n: 'gift present wrapped' }, { e: '🎈', n: 'balloon party' },
      { e: '🎀', n: 'ribbon bow cute' }, { e: '✨', n: 'sparkles magic shine' },
      { e: '💯', n: 'hundred points perfect score' },
    ],
  },
  {
    id: 'travel', label: 'Travel', icon: '✈️',
    emojis: [
      { e: '✈️', n: 'airplane flight travel plane' }, { e: '🚀', n: 'rocket space launch' },
      { e: '🚗', n: 'car automobile drive' }, { e: '🚕', n: 'taxi cab' },
      { e: '🚌', n: 'bus' }, { e: '🚂', n: 'train locomotive' },
      { e: '🚢', n: 'ship cruise boat' }, { e: '⛵', n: 'sailboat sailing' },
      { e: '🏖️', n: 'beach umbrella vacation' }, { e: '🏝️', n: 'desert island palm' },
      { e: '🏕️', n: 'camping tent' }, { e: '🏔️', n: 'mountain snow peak' },
      { e: '🌋', n: 'volcano eruption' }, { e: '🗼', n: 'tokyo tower eiffel' },
      { e: '🗽', n: 'statue of liberty new york' }, { e: '🏰', n: 'castle palace' },
      { e: '🕌', n: 'mosque masjid islam' }, { e: '🕋', n: 'kaaba mecca islam' },
      { e: '⛪', n: 'church chapel' }, { e: '🏯', n: 'japanese castle' },
      { e: '🌉', n: 'bridge night' }, { e: '🎡', n: 'ferris wheel amusement' },
      { e: '🎢', n: 'roller coaster amusement park' }, { e: '🏟️', n: 'stadium sports' },
      { e: '🚲', n: 'bicycle bike cycle' }, { e: '🛵', n: 'scooter motor' },
      { e: '🛶', n: 'canoe boat' }, { e: '🏨', n: 'hotel building' },
      { e: '🗺️', n: 'map world' }, { e: '🧭', n: 'compass navigation' },
    ],
  },
  {
    id: 'objects', label: 'Objects', icon: '💡',
    emojis: [
      { e: '📱', n: 'mobile phone smartphone' }, { e: '💻', n: 'laptop computer' },
      { e: '⌚', n: 'watch time' }, { e: '📷', n: 'camera photo' },
      { e: '🎥', n: 'video camera movie' }, { e: '💡', n: 'light bulb idea' },
      { e: '🔑', n: 'key' }, { e: '🔒', n: 'locked lock' },
      { e: '🔓', n: 'unlocked open lock' }, { e: '📚', n: 'books stack study' },
      { e: '📖', n: 'open book reading' }, { e: '✏️', n: 'pencil write' },
      { e: '🖊️', n: 'pen ballpoint' }, { e: '📝', n: 'memo note writing' },
      { e: '💰', n: 'money bag cash rich' }, { e: '💳', n: 'credit card bank' },
      { e: '🎒', n: 'backpack school bag' }, { e: '👓', n: 'glasses eyeglasses' },
      { e: '🕶️', n: 'sunglasses shades' }, { e: '👑', n: 'crown royal king queen' },
      { e: '💎', n: 'diamond gem jewel' }, { e: '🧸', n: 'teddy bear toy plush' },
      { e: '🪴', n: 'potted plant' }, { e: '🕯️', n: 'candle light' },
      { e: '🧴', n: 'lotion bottle skincare' }, { e: '💄', n: 'lipstick makeup' },
      { e: '🛍️', n: 'shopping bags' }, { e: '📦', n: 'package box delivery' },
      { e: '🔋', n: 'battery charge' }, { e: '🧲', n: 'magnet' },
      { e: '✂️', n: 'scissors cut' },
    ],
  },
  {
    id: 'symbols', label: 'Symbols', icon: '✨',
    emojis: [
      { e: '✨', n: 'sparkles stars magic' }, { e: '⭐', n: 'star' },
      { e: '🌟', n: 'glowing star' }, { e: '💫', n: 'dizzy star shooting' },
      { e: '💥', n: 'collision boom explosion' }, { e: '💢', n: 'anger symbol mad' },
      { e: '❗', n: 'exclamation mark important' }, { e: '❓', n: 'question mark why' },
      { e: '⁉️', n: 'exclamation question mark' }, { e: '‼️', n: 'double exclamation' },
      { e: '💯', n: 'hundred points perfect' }, { e: '✅', n: 'check mark done correct' },
      { e: '❌', n: 'cross mark x wrong' }, { e: '⭕', n: 'hollow red circle correct' },
      { e: '🔴', n: 'red circle' }, { e: '🟠', n: 'orange circle' },
      { e: '🟡', n: 'yellow circle' }, { e: '🟢', n: 'green circle' },
      { e: '🔵', n: 'blue circle' }, { e: '🟣', n: 'purple circle' },
      { e: '⚪', n: 'white circle' }, { e: '⚫', n: 'black circle' },
      { e: '🟤', n: 'brown circle' }, { e: '🔶', n: 'orange diamond' },
      { e: '🔷', n: 'blue diamond' }, { e: '♻️', n: 'recycle recycling' },
      { e: '⚠️', n: 'warning sign caution' }, { e: '☮️', n: 'peace symbol' },
      { e: '☯️', n: 'yin yang balance' }, { e: '☪️', n: 'star crescent moon islam' },
      { e: '🕉️', n: 'om symbol' }, { e: '✝️', n: 'cross christian' },
      { e: '🔱', n: 'trident' }, { e: '⚜️', n: 'fleur de lis' },
      { e: '🆘', n: 'sos help emergency' }, { e: '🆒', n: 'cool button' },
    ],
  },
  {
    id: 'flags', label: 'Flags', icon: '🏳️',
    emojis: [
      { e: '🇵🇰', n: 'pakistan flag' }, { e: '🇮🇳', n: 'india flag' },
      { e: '🇧🇩', n: 'bangladesh flag' }, { e: '🇦🇫', n: 'afghanistan flag' },
      { e: '🇸🇦', n: 'saudi arabia flag' }, { e: '🇦🇪', n: 'uae emirates dubai flag' },
      { e: '🇹🇷', n: 'turkey flag turkiye' }, { e: '🇮🇷', n: 'iran flag' },
      { e: '🇬🇧', n: 'united kingdom britain england flag' }, { e: '🇺🇸', n: 'usa america united states flag' },
      { e: '🇨🇦', n: 'canada flag' }, { e: '🇦🇺', n: 'australia flag' },
      { e: '🇨🇳', n: 'china flag' }, { e: '🇯🇵', n: 'japan flag' },
      { e: '🇰🇷', n: 'south korea flag' }, { e: '🇩🇪', n: 'germany flag' },
      { e: '🇫🇷', n: 'france flag' }, { e: '🇮🇹', n: 'italy flag' },
      { e: '🇪🇸', n: 'spain flag' }, { e: '🇷🇺', n: 'russia flag' },
      { e: '🇧🇷', n: 'brazil flag' }, { e: '🇪🇬', n: 'egypt flag' },
      { e: '🏳️', n: 'white flag' }, { e: '🏴', n: 'black flag' },
      { e: '🏴‍☠️', n: 'pirate flag' }, { e: '🏳️‍🌈', n: 'rainbow flag pride' },
    ],
  },
];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(GROUPS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const q = query.trim().toLowerCase();
  // Match whole words by prefix ("cat" finds cat faces, not "vacation").
  const qWords = q.split(/\s+/).filter(Boolean);
  const results = q
    ? GROUPS.flatMap(g => g.emojis.filter(item => {
        const words = item.n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        return qWords.every(qw => words.some(w => w.startsWith(qw)));
      }).map(item => ({ ...item, group: g.label })))
    : [];

  function jumpTo(id: string) {
    setQuery('');
    setActive(id);
    const container = scrollRef.current;
    const section = sectionRefs.current[id];
    if (container && section) {
      container.scrollTo({ top: section.offsetTop - 8, behavior: 'smooth' });
    }
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || q) return;
    let current = GROUPS[0].id;
    for (const g of GROUPS) {
      const section = sectionRefs.current[g.id];
      if (section && section.offsetTop - container.scrollTop <= 56) current = g.id;
    }
    setActive(current);
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        boxShadow: '0 8px 28px var(--color-primary-alpha)',
        width: 340,
        maxWidth: '92vw',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div className="p-2 pb-1">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: 'var(--color-secondary)', borderRadius: 12 }}
        >
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder="Search emojis… try “cat”"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm theme-text"
            style={{ color: 'var(--color-text)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-0.5 px-2 pb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {GROUPS.map(g => (
          <button
            key={g.id}
            type="button"
            title={g.label}
            onClick={() => jumpTo(g.id)}
            className="flex-1 text-lg py-1.5 rounded-lg transition-all"
            style={{
              background: active === g.id && !q ? 'var(--color-secondary)' : 'transparent',
              opacity: active === g.id && !q ? 1 : 0.55,
              transform: active === g.id && !q ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            {g.icon}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="p-2 pt-1"
        style={{ maxHeight: 300, overflowY: 'auto', position: 'relative' }}
      >
        {q ? (
          results.length > 0 ? (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider px-1 pb-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {results.length} result{results.length === 1 ? '' : 's'}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {results.map((item, i) => (
                  <button
                    key={`${item.e}-${i}`}
                    type="button"
                    title={item.n}
                    onClick={() => onPick(item.e)}
                    className="text-[22px] p-1 rounded-lg transition-transform hover:scale-125"
                    style={{ lineHeight: 1.2 }}
                  >
                    {item.e}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
              No matches for “{query.trim()}” — try another word ♡
            </p>
          )
        ) : (
          GROUPS.map(group => (
            <div
              key={group.id}
              ref={el => { sectionRefs.current[group.id] = el; }}
              className="mb-2 last:mb-0"
            >
              <div
                className="text-[10px] font-bold uppercase tracking-wider px-1 py-1 sticky top-0 z-10"
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)' }}
              >
                {group.label}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map(item => (
                  <button
                    key={item.e}
                    type="button"
                    title={item.n}
                    onClick={() => onPick(item.e)}
                    className="text-[22px] p-1 rounded-lg transition-transform hover:scale-125"
                    style={{ lineHeight: 1.2 }}
                  >
                    {item.e}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
