import filter from 'leo-profanity';
import { ru as naughtyWordsRu } from 'naughty-words';

// Load Russian dictionary from leo-profanity (248 words)
filter.loadDictionary('ru');

// Add additional words from naughty-words (151 words)
// This gives us ~400 unique profane words for more comprehensive filtering
naughtyWordsRu.forEach((word: string) => filter.add(word));

// Add comprehensive list of anatomical/sexual terms that should be blocked
// Including medical terms, colloquial, slang, diminutives in Russian and English
const anatomicalTerms = [
  // Male anatomy - medical and colloquial
  'член',
  'пенис',
  'хуй',
  'хуя',
  'хую',
  'хуем',
  'хуище',
  'писюн',
  'писюнчик',
  'залупа',
  'dick',
  'cock',
  'penis',
  'хер',
  'хера',
  'херу',
  'хрен',
  'фаллос',
  'болт',
  'елда',
  'елдак',
  'уд',
  'краник',
  'достоинство',

  // Female anatomy - medical and colloquial
  'пизда',
  'пизды',
  'пизде',
  'пиздой',
  'пиздень',
  'пиздище',
  'vagina',
  'вагина',
  'киска',
  'кися',
  'киса',
  'pussy',
  'вульва',
  'влагалище',
  'пися',
  'писька',
  'письку',
  'пиписка',
  'пиписька',
  'щель',
  'щелка',
  'дыра',
  'дырка',
  'мандa',
  'манда',
  'манду',
  'пилотка',
  'лоно',
  'промежность',

  // Rear anatomy - all variations
  'жопа',
  'жопы',
  'жопе',
  'жопой',
  'жопка',
  'жопку',
  'жопкой',
  'попа',
  'попы',
  'попе',
  'попой',
  'попка',
  'попку',
  'попкой',
  'ass',
  'задница',
  'задницы',
  'задницу',
  'задник',
  'очко',
  'очка',
  'очку',
  'анус',
  'anus',
  'срака',
  'сраки',
  'сраке',
  'сракой',
  'булки',
  'булок',
  'ягодицы',
  'ягодиц',
  'ягодицам',
  'зад',
  'зада',
  'заду',
  'дупа',
  'дупу',
  'дупой',
  'жеппа',
  'жеппы',
  'очелло',
  'шоколадница',

  // Chest-related - all variations
  'сиськи',
  'сисек',
  'сискам',
  'сиська',
  'сисяки',
  'сися',
  'титьки',
  'титек',
  'титька',
  'титьку',
  'грудь',
  'груди',
  'грудей',
  'tits',
  'boobs',
  'сосок',
  'соска',
  'соску',
  'соски',
  'сосков',
  'дойки',
  'дойка',
  'буфера',
  'буфер',
  'бюст',
  'дыньки',
  'дынька',
  'молочко',
  'молочка',

  // Testicles - all variations
  'яйца',
  'яиц',
  'яйцам',
  'яйцами',
  'яички',
  'яичек',
  'яичкам',
  'balls',
  'мошонка',
  'мошонки',
  'мудь',
  'муде',
  'муди',
  'муда',
  'муденция',
  'мудак',
  'яйки',
  'яйко',
  'шары',
  'шаров',

  // Other sexual/anatomical terms
  'клитор',
  'клитора',
  'клиторе',
  'пах',
  'паха',
  'паху',
  'лобок',
  'лобка',
  'лобке',
  'промежность',
  'половые',
  'гениталии',
  'гениталий',
  'genitals',
  'репродуктивные',
  'интимные',
  'интимная',
  'интимное',
  'писать',
  'мочиться',
  'pee',
  'piss',
  'моча',
  'уретра',
  'мочеиспускательный',

  // Slang variations
  'письюн',
  'письюнчик',
  'пипирка',
  'пиписюн',
  'пипиську',
  'писюха',
  'писюшка',
  'петух',
  'петуха',
  'краник',
  'кранчик',
];

// Add custom anatomical terms to filter
anatomicalTerms.forEach((term: string) => filter.add(term));

/**
 * Check if text contains profanity
 * Uses combined dictionary from leo-profanity and naughty-words
 * @param text Text to check
 * @returns true if profanity detected, false otherwise
 */
export function containsProfanity(text: string): boolean {
  return filter.check(text);
}

/**
 * Clean profanity from text (for logging purposes)
 * @param text Text to clean
 * @returns Cleaned text with profanity replaced by asterisks
 */
export function cleanProfanity(text: string): string {
  return filter.clean(text);
}

export const profanityFilter = {
  check: containsProfanity,
  clean: cleanProfanity,
};
