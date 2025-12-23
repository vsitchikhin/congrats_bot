import type { Context } from '#root/bot/context.js';
import path from 'node:path';
import process from 'node:process';
import { logger } from '#root/logger.js';
import { I18n } from '@grammyjs/i18n';

export const i18n = new I18n<Context>({
  defaultLocale: 'ru',
  directory: path.resolve(process.cwd(), 'locales'),
  useSession: false, // Only Russian locale, no need for session
  fluentBundleOptions: {
    useIsolating: false,
  },
});

logger.info(`Loaded i18n locales: ${i18n.locales.join(', ')}`);

export const isMultipleLocales = i18n.locales.length > 1;
