import type { Context } from '#root/bot/context.js';
import { Composer } from 'grammy';

const composer = new Composer<Context>();

composer.command('start', async (ctx) => {
  await ctx.reply(ctx.t('greeting-welcome'));
});

export { composer as greetingFeature };
