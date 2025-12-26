import type { Context } from '#root/bot/context.js';
import type { ErrorHandler } from 'grammy';
import { getUpdateInfo } from '#root/bot/helpers/logging.js';

export const errorHandler: ErrorHandler<Context> = async (error) => {
  const { ctx } = error;

  ctx.logger.error({
    err: error.error,
    update: getUpdateInfo(ctx),
  });

  // Handle conversation replay errors (e.g., after bot restart)
  const errorMessage = (error.error instanceof Error) ? error.error.message : String(error.error ?? '');
  const isConversationError = errorMessage.includes('Bad replay') || errorMessage.includes('conversation');

  if (isConversationError) {
    ctx.logger.warn({ userId: ctx.from?.id }, 'Conversation error detected - resetting session');

    try {
      // Reset session to clear broken conversation state
      const currentLocale = ctx.session?.locale ?? 'ru';
      ctx.session = {
        locale: currentLocale,
        orderingFlow: undefined,
        isReordering: false,
      };

      // Notify user about the reset
      await ctx.reply(
        '⚠️ Произошла ошибка в диалоге. Давайте начнем сначала!\n\n'
        + 'Нажмите /start чтобы продолжить.',
      );
    }
    catch (resetError) {
      ctx.logger.error({ err: resetError }, 'Failed to reset session after conversation error');
    }
  }
};
