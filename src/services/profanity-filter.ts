import filter from 'leo-profanity';
import { ru as naughtyWordsRu } from 'naughty-words';

// Load Russian dictionary from leo-profanity (248 words)
filter.loadDictionary('ru');

// Add additional words from naughty-words (151 words)
// This gives us ~400 unique profane words for more comprehensive filtering
naughtyWordsRu.forEach((word: string) => filter.add(word));

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
