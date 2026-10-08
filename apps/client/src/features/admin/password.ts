/**
 * Generated passwords (design 08-users): two short lowercase words and two digits,
 * "orbit-cedar-42". Easy to read aloud or copy onto paper for a student, and past the
 * server's 8-character floor. Never stored anywhere: the caller holds it in component state.
 */
export const PASSWORD_WORDS: readonly string[] = [
  'orbit',
  'cedar',
  'amber',
  'apple',
  'arrow',
  'aspen',
  'atlas',
  'badge',
  'baker',
  'basil',
  'beach',
  'beam',
  'bean',
  'bear',
  'bell',
  'berry',
  'birch',
  'bison',
  'blade',
  'bloom',
  'board',
  'boat',
  'bolt',
  'brave',
  'bread',
  'brick',
  'bridge',
  'brook',
  'brush',
  'cabin',
  'cable',
  'cake',
  'camel',
  'candle',
  'canoe',
  'canyon',
  'cargo',
  'carrot',
  'castle',
  'chalk',
  'charm',
  'cheese',
  'cherry',
  'chess',
  'cider',
  'cliff',
  'cloud',
  'clover',
  'coast',
  'cobalt',
  'cocoa',
  'comet',
  'coral',
  'cotton',
  'crane',
  'crown',
  'cube',
  'daisy',
  'delta',
  'denim',
  'desk',
  'dingo',
  'disk',
  'dock',
  'dove',
  'dragon',
  'drum',
  'dune',
  'eagle',
  'earth',
  'echo',
  'elbow',
  'ember',
  'engine',
  'fable',
  'falcon',
  'fern',
  'ferry',
  'field',
  'finch',
  'flame',
  'flint',
  'flute',
  'forest',
  'fox',
  'frost',
  'fudge',
  'gable',
  'galaxy',
  'garden',
  'gecko',
  'gem',
  'ginger',
  'globe',
  'goat',
  'grape',
  'gravel',
  'guitar',
  'harbor',
  'hazel',
  'heron',
  'hill',
  'honey',
  'horse',
  'igloo',
  'iris',
  'island',
  'ivory',
  'jacket',
  'jade',
  'jasmine',
  'jelly',
  'jet',
  'jungle',
  'kayak',
  'kettle',
  'kite',
  'koala',
  'ladder',
  'lake',
  'lamp',
  'lantern',
  'lemon',
  'lily',
  'lime',
  'lizard',
  'llama',
  'lotus',
  'lunar',
  'magnet',
  'mango',
  'maple',
  'marble',
  'meadow',
  'melon',
  'meteor',
  'mint',
  'mitten',
  'moose',
  'moss',
  'motor',
  'muffin',
  'nectar',
  'nest',
  'noodle',
  'oak',
  'oasis',
  'ocean',
  'olive',
  'onion',
  'opal',
  'orange',
  'orchid',
  'otter',
  'owl',
  'paddle',
  'panda',
  'paper',
  'parrot',
  'peach',
  'peanut',
  'pearl',
  'pebble',
  'pecan',
  'pepper',
  'piano',
  'pigeon',
  'pillow',
  'pine',
  'pixel',
  'planet',
  'plum',
  'polar',
  'pond',
  'poppy',
  'prism',
  'puffin',
  'pumpkin',
  'quartz',
  'quill',
  'rabbit',
  'radar',
  'radio',
  'rain',
  'raven',
  'reef',
  'ribbon',
  'river',
  'robin',
  'rocket',
  'ruby',
  'saddle',
  'salmon',
  'sand',
  'satin',
  'scarf',
  'shell',
  'silver',
  'sky',
  'sled',
  'slope',
  'snow',
  'socket',
  'solar',
  'sparrow',
  'spice',
  'spoon',
  'spruce',
  'squash',
  'star',
  'stone',
  'storm',
  'sugar',
  'summit',
  'sunny',
  'swan',
  'table',
  'tango',
  'tiger',
  'toast',
  'tomato',
  'topaz',
  'torch',
  'tower',
  'trail',
  'tulip',
  'tundra',
  'turtle',
  'valley',
  'velvet',
  'violet',
  'wagon',
  'walnut',
  'whale',
  'willow',
  'window',
  'winter',
  'wolf',
  'yarn',
  'yeti',
  'zebra',
  'zinc',
  'acorn',
  'anchor',
  'banjo',
  'beacon',
  'bubble',
  'button',
  'cactus',
  'canvas',
  'cobra',
  'cookie',
  'copper',
  'cosmos',
  'cricket',
  'dolphin',
];

/** Fills a byte buffer with random bytes: `crypto.getRandomValues` in the app. */
export type FillRandom = (buffer: Uint8Array) => Uint8Array;

/** A whole number in [0, n). */
export type RandomInt = (n: number) => number;

const cryptoFill: FillRandom = (buffer) => crypto.getRandomValues(buffer);

/**
 * `RandomInt` from a byte source, by rejection sampling: a byte at or above the largest
 * multiple of n is skipped, so every value is equally likely. n is at most 256.
 */
export function randomIntFrom(fill: FillRandom): RandomInt {
  return (n) => {
    const cutoff = 256 - (256 % n);
    for (;;) {
      const byte = fill(new Uint8Array(1))[0]!;
      if (byte < cutoff) return byte % n;
    }
  };
}

/** "<word>-<word>-<dd>". Pass `random` to make it repeatable in a test. */
export function generatePassword(random: RandomInt = randomIntFrom(cryptoFill)): string {
  const word = () => PASSWORD_WORDS[random(PASSWORD_WORDS.length)]!;
  const first = word();
  const second = word();
  const digits = String(random(100)).padStart(2, '0');
  return `${first}-${second}-${digits}`;
}

/** What a username may hold (packages/shared USERNAME_PATTERN): letters, digits, . _ - */
const NOT_ALLOWED = /[^\p{L}\p{N}._-]/gu;
const MAX_USERNAME = 40;

/**
 * "Gal Levy" -> "gal.l": the first name and the first letter of the last name, lowercase.
 * One word stays as it is ("Noa" -> "noa"). A taken name gets a digit: "gal.l2", "gal.l3".
 * `taken` holds the existing usernames, lowercase.
 */
export function suggestUsername(fullName: string, taken: Set<string>): string {
  const words = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(NOT_ALLOWED, ''))
    .filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0]!;
  const last = words.length > 1 ? Array.from(words[words.length - 1]!)[0] : undefined;
  const base = (last ? `${first}.${last}` : first).slice(0, MAX_USERNAME);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const name = base.slice(0, MAX_USERNAME - suffix.length) + suffix;
    if (!taken.has(name)) return name;
  }
}
