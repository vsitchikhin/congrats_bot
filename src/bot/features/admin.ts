import type { Context } from '#root/bot/context.js';
import { Composer } from 'grammy';

const composer = new Composer<Context>();

// No admin commands for now, but keeping the feature structure.
// You can add admin-specific commands here in the future.
// For example:
// import { isAdmin } from '#root/bot/filters/is-admin.js';
// composer.chatType('private').filter(isAdmin).command('stats', logHandle('command-stats'), (ctx) => { ... });

export { composer as adminFeature };
