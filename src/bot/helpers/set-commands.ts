import type { Context } from '#root/bot/context.js';
import type { LanguageCode } from '@grammyjs/types';
import type { Bot } from 'grammy';
import { i18n } from '#root/bot/i18n.js';
import { config } from '#root/config.js';
import { Command, CommandGroup } from '@grammyjs/commands';

function addCommandLocalizations(command: Command) {
  i18n.locales.forEach((locale) => {
    command.localize(
      locale as LanguageCode,
      command.name,
      i18n.t(locale, `${command.name}.description`),
    );
  });
  return command;
}

export async function setBotCommands(bot: Bot<Context>) {
  const start = new Command('start', i18n.t('en', 'start.description'))
    .addToScope({ type: 'all_private_chats' });
  addCommandLocalizations(start);

  const language = new Command('language', i18n.t('en', 'language.description'))
    .addToScope({ type: 'all_private_chats' });
  addCommandLocalizations(language);

  // Admin-only commands
  const setcommands = new Command('setcommands', i18n.t('en', 'setcommands.description'));
  for (const adminId of config.botAdmins) {
    setcommands.addToScope({ type: 'chat', chat_id: adminId });
  }

  const commands = new CommandGroup()
    .add(start)
    .add(language)
    .add(setcommands);

  await commands.setCommands({ api: bot.api });
}
