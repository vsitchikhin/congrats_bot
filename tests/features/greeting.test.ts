import type { Context } from '#root/bot/context.js';
import type { Update, UserFromGetMe } from '@grammyjs/types';
import { greetingFeature } from '#root/bot/features/greeting.js';
import { Bot, Context as GrammyContext, GrammyError, HttpError } from 'grammy';
import { pino } from 'pino'; // Import pino to use its types
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks for dependencies
vi.mock('pino', () => {
  const mockPino = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(() => mockPino), // child returns a mock instance too
    level: 'info',
    version: '8.0.0', // Required property
    on: vi.fn(), // Mock the 'on' method
  };
  return { pino: vi.fn(() => mockPino), default: vi.fn(() => mockPino) };
});

vi.mock('#root/config.js', () => ({
  config: {
    botAdmins: [],
    isPollingMode: true,
    botToken: 'test-token',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/new_year_bot_test?schema=public',
    redisHost: 'localhost',
    redisPort: 6379,
    debug: false,
    logLevel: 'info',
    botAllowedUpdates: [],
    isDebug: false,
    isWebhookMode: false,
  },
}));

vi.mock('#root/logger.js', () => ({
  logger: pino(), // Use the mocked pino instance
}));

// Bot info mock
const botInfo = {
  id: 42,
  first_name: 'Test Bot',
  is_bot: true,
  username: 'testbot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

describe('greetingFeature', () => {
  let bot: Bot<Context>;

  beforeEach(() => {
    bot = new Bot<Context>('test-token');
    bot.botInfo = botInfo;
    bot.use(greetingFeature);
    bot.catch((err) => {
      const { ctx } = err;
      console.error(`Error while handling update ${ctx.update.update_id}:`);
      const e = err.error;
      if (e instanceof GrammyError)
        console.error('Error in request:', e.description);

      else if (e instanceof HttpError)
        console.error('Could not contact Telegram:', e);

      else
        console.error('Unknown error:', e);
    });
  });

  const createTestContext = (update: Update) => {
    const ctx = new GrammyContext(update, bot.api, bot.botInfo) as Context;

    // Mock all the custom properties of our context
    ctx.config = {
      botMode: 'polling',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/new_year_bot_test?schema=public',
      redisHost: 'localhost',
      redisPort: 6379,
      debug: false,
      logLevel: 'info',
      botToken: 'test-token',
      botAllowedUpdates: [],
      botAdmins: [],
      isDebug: false,
      isWebhookMode: false,
      isPollingMode: true,
    };
    ctx.session = {};
    ctx.t = vi.fn();
    ctx.reply = vi.fn();

    // Mock i18n functionality
    vi.spyOn(ctx, 't').mockImplementation((key: string) => {
      if (key === 'greeting-welcome')
        return 'Welcome to the New Year Bot!';
      return key;
    });

    return ctx;
  };

  const createUpdate = (text: string): Update => {
    const isCommand = text.startsWith('/');
    return {
      update_id: 1,
      message: {
        message_id: 1,
        from: {
          id: 1,
          is_bot: false,
          first_name: 'Test',
          username: 'testuser',
        },
        chat: { id: 1, type: 'private', first_name: 'Test', username: 'testuser', last_name: 'User' },
        date: Date.now(),
        text,
        ...(isCommand && {
          entities: [{ type: 'bot_command', offset: 0, length: text.length }],
        }),
      },
    };
  };

  it('should reply to /start command', async () => {
    const update = createUpdate('/start');
    const ctx = createTestContext(update);
    const middleware = bot.middleware();

    await middleware(ctx, async () => {});

    expect(ctx.t).toHaveBeenCalledWith('greeting-welcome');
    expect(ctx.reply).toHaveBeenCalledWith('Welcome to the New Year Bot!');
  });

  it('should not reply to other commands', async () => {
    const update = createUpdate('/foo');
    const ctx = createTestContext(update);
    const middleware = bot.middleware();

    await middleware(ctx, async () => {});

    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
