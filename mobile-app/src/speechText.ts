import type { StoryLanguage } from './types';

/**
 * Cleans story text just before it is sent to the phone's voice. The voice
 * reads raw text badly in a few known ways: it says "NCR" as a word, it trips
 * on "NH-24", and it does not know what a dash between two years means.
 * This changes only what is spoken. The text shown on screen stays as written.
 *
 * This file has no phone-specific code, so it is easy to test.
 */

/** All-caps words that really are said as words, so their letters are not split. */
const SAID_AS_WORDS = new Set([
  'NOIDA',
  'RIICO',
  'UDAN',
  'ISRO',
  'NASA',
  'AIIMS',
  'UNESCO',
  'UNICEF',
  'NATO',
  'OK',
]);

/** Roman numerals, as in "Firuz Shah III". The voice already reads these. */
const ROMAN_NUMERALS = new Set([
  'II',
  'III',
  'IV',
  'VI',
  'VII',
  'VIII',
  'IX',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
  'XVII',
  'XVIII',
  'XIX',
  'XX',
]);

const HINDI_LETTER_NAMES: Record<string, string> = {
  A: 'ए',
  B: 'बी',
  C: 'सी',
  D: 'डी',
  E: 'ई',
  F: 'एफ़',
  G: 'जी',
  H: 'एच',
  I: 'आई',
  J: 'जे',
  K: 'के',
  L: 'एल',
  M: 'एम',
  N: 'एन',
  O: 'ओ',
  P: 'पी',
  Q: 'क्यू',
  R: 'आर',
  S: 'एस',
  T: 'टी',
  U: 'यू',
  V: 'वी',
  W: 'डब्ल्यू',
  X: 'एक्स',
  Y: 'वाई',
  Z: 'ज़ेड',
};

type Words = {
  nationalHighway: string;
  stateHighway: string;
  kilometresPerHour: string;
  squareKilometres: string;
  kilometres: string;
  percent: string;
  degreesCelsius: string;
  rupees: string;
  and: string;
  to: string;
  letter: (letter: string) => string;
};

const WORDS: Record<StoryLanguage, Words> = {
  en: {
    nationalHighway: 'National Highway',
    stateHighway: 'State Highway',
    kilometresPerHour: 'kilometres per hour',
    squareKilometres: 'square kilometres',
    kilometres: 'kilometres',
    percent: 'percent',
    degreesCelsius: 'degrees Celsius',
    rupees: 'rupees',
    and: 'and',
    to: 'to',
    letter: letter => letter,
  },
  hi: {
    nationalHighway: 'राष्ट्रीय राजमार्ग',
    stateHighway: 'राज्य राजमार्ग',
    kilometresPerHour: 'किलोमीटर प्रति घंटा',
    squareKilometres: 'वर्ग किलोमीटर',
    kilometres: 'किलोमीटर',
    percent: 'प्रतिशत',
    degreesCelsius: 'डिग्री सेल्सियस',
    rupees: 'रुपये',
    and: 'और',
    to: 'से',
    letter: letter => HINDI_LETTER_NAMES[letter] ?? letter,
  },
};

export function prepareForSpeech(text: string, language: StoryLanguage = 'en'): string {
  const w = WORDS[language];
  let out = text;

  // Road numbers: NH-24, NH 58, NH9, SH-57.
  out = out.replace(/\bNH[\s-]?(\d+[A-Z]?)\b/g, `${w.nationalHighway} $1`);
  out = out.replace(/\bSH[\s-]?(\d+[A-Z]?)\b/g, `${w.stateHighway} $1`);

  // Units and symbols.
  out = out.replace(/\bkm\s?\/\s?h\b|\bkmph\b/gi, w.kilometresPerHour);
  out = out.replace(/\bsq\.?\s?km\b/gi, w.squareKilometres);
  out = out.replace(/(\d)\s?km\b/g, `$1 ${w.kilometres}`);
  out = out.replace(/(\d)\s?%/g, `$1 ${w.percent}`);
  out = out.replace(/\s?°\s?C\b/g, ` ${w.degreesCelsius}`);
  out = out.replace(/₹\s?|\bRs\.?\s?(?=\d)/g, `${w.rupees} `);
  out = out.replace(/\s&\s/g, ` ${w.and} `);

  // A dash between two numbers is a range: "1819–1821" is "1819 to 1821".
  out = out.replace(/(\d)\s?[–—]\s?(\d)/g, `$1 ${w.to} $2`);
  out = out.replace(/\b(\d{4})-(\d{4})\b/g, `$1 ${w.to} $2`);
  // A long dash used as a pause becomes a comma. A dash joining two names,
  // as in "Delhi–Meerut", becomes a space.
  out = out.replace(/\s[–—]\s/g, ', ');
  out = out.replace(/[–—]/g, ' ');

  // Short forms in capital letters are said letter by letter: NCR is "N C R".
  out = out.replace(/\b[A-Z]{2,5}\b/g, word => {
    if (SAID_AS_WORDS.has(word) || ROMAN_NUMERALS.has(word)) return word;
    return word.split('').map(w.letter).join(' ');
  });

  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.।])/g, '$1').trim();
}
