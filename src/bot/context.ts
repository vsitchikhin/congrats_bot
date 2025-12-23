import type { Config } from '#root/config.js';
import type { Logger } from '#root/logger.js';
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action';
import type { ConversationFlavor } from '@grammyjs/conversations';
import type { HydrateFlavor } from '@grammyjs/hydrate';
import type { I18nFlavor } from '@grammyjs/i18n';
import type { ParseModeFlavor } from '@grammyjs/parse-mode';
import type { Context as DefaultContext, SessionFlavor } from 'grammy';

export interface SessionData {
  locale?: string;
  // field?: string;
}

interface ExtendedContextFlavor {
  logger: Logger;
  config: Config;
}

// Base context without conversations (used as "inside" context for conversations)
export type BaseContext =
  ParseModeFlavor<
    HydrateFlavor<
      DefaultContext &
      ExtendedContextFlavor &
      SessionFlavor<SessionData> &
      I18nFlavor &
      AutoChatActionFlavor
    >
  >;

// Full context with conversations (used as "outside" context for middleware)
export type Context = ConversationFlavor<BaseContext>;
