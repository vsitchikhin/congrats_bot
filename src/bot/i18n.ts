import type { Context } from '#root/bot/context.js';
import path from 'node:path';
import process from 'node:process';
import { logger } from '#root/logger.js';
import { I18n } from '@grammyjs/i18n';

export const i18n = new I18n<Context>({
  defaultLocale: 'ru',
  directory: path.resolve(process.cwd(), 'locales'),
  fluentBundleOptions: {
    useIsolating: false,
  },
});

logger.info(`Loaded i18n locales: ${i18n.locales.join(', ')}`);
