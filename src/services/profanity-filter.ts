import filter from 'leo-profanity';

// Load Russian dictionary
filter.loadDictionary('ru');

/**
 * Check if text contains profanity
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
