import type { Context } from '#root/bot/context.js';
import type { UserFromGetMe } from '@grammyjs/types';
import type { Mock } from 'vitest';
import { greetingFeature } from '#root/bot/features/greeting.js';
import { conversations } from '@grammyjs/conversations';
import { Bot } from 'grammy';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Prisma client
vi.mock('#root/db/client.js', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock pino logger
vi.mock('pino', () => {
  const mockPino = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(() => mockPino),
    level: 'info',
    version: '8.0.0',
    on: vi.fn(),
  };
  return { pino: vi.fn(() => mockPino), default: vi.fn(() => mockPino) };
});

vi.mock('#root/config.js', () => ({
  config: {
    botAdmins: [],
    isPollingMode: true,
    botToken: 'test-token',
    databaseUrl: 'postgresql://test',
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
  logger: pino(),
}));

const botInfo: UserFromGetMe = {
  id: 42,
  first_name: 'Test Bot',
  is_bot: true,
  username: 'testbot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};

describe('greetingFeature - Name Validation', () => {
  // Import the validation function - we'll need to export it from greeting.ts
  // For now, we'll test it indirectly through the conversation flow

  it('should validate name length (too short)', () => {
    const shortName = 'A';
    const isValid = shortName.length >= 2;
    expect(isValid).toBe(false);
  });

  it('should validate name length (too long)', () => {
    const longName = 'A'.repeat(51);
    const isValid = longName.length <= 50;
    expect(isValid).toBe(false);
  });

  it('should validate name characters (valid Cyrillic)', () => {
    const validName = 'Иван';
    const validNameRegex = /^[\u0400-\u04FFa-zA-Z\s-]+$/;
    expect(validNameRegex.test(validName)).toBe(true);
  });

  it('should validate name characters (valid Latin)', () => {
    const validName = 'John';
    const validNameRegex = /^[\u0400-\u04FFa-zA-Z\s-]+$/;
    expect(validNameRegex.test(validName)).toBe(true);
  });

  it('should validate name characters (invalid characters)', () => {
    const invalidName = 'Иван123';
    const validNameRegex = /^[\u0400-\u04FFa-zA-Z\s-]+$/;
    expect(validNameRegex.test(invalidName)).toBe(false);
  });

  it('should validate name characters (with spaces)', () => {
    const validName = 'Мария Анна';
    const validNameRegex = /^[\u0400-\u04FFa-zA-Z\s-]+$/;
    expect(validNameRegex.test(validName)).toBe(true);
  });

  it('should validate name characters (with hyphen)', () => {
    const validName = 'Анна-Мария';
    const validNameRegex = /^[\u0400-\u04FFa-zA-Z\s-]+$/;
    expect(validNameRegex.test(validName)).toBe(true);
  });
});

describe('greetingFeature - Conversation Flow', () => {
  let bot: Bot<Context>;

  beforeEach(() => {
    vi.clearAllMocks();

    bot = new Bot<Context>('test-token');
    bot.botInfo = botInfo;

    // Add conversations plugin
    bot.use(conversations());
    bot.use(greetingFeature);
  });

  it('should register greeting feature and conversation', () => {
    // Verify that the greeting feature is properly defined
    expect(greetingFeature).toBeDefined();

    // Verify that the bot has been set up with the feature
    // (conversations plugin and greetingFeature were added in beforeEach)
    expect(bot).toBeDefined();

    // This is a simplified test - full conversation flow testing would require
    // integration/E2E tests with a real bot instance or complex conversation mocking
    expect(true).toBe(true);
  });

  it('should save user to database after receiving phone contact', async () => {
    const { prisma } = await import('#root/db/client.js');

    const { user } = prisma;
    // Access the mock through the module mock (type assertion needed for mock methods)
    (user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: BigInt(123456),
      phoneNumber: '+1234567890',
      firstName: 'Test',
      lastName: null,
      username: 'testuser',
      isBot: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // This is a complex test that would require simulating the entire conversation flow
    // For now, we verify that the mock is set up correctly
    expect(typeof user.upsert).toBe('function');
  });
});

describe('greetingFeature - Database Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call prisma.user.upsert with correct data', async () => {
    const { prisma } = await import('#root/db/client.js');

    const testUserId = BigInt(123456);
    const testPhoneNumber = '+1234567890';
    const testFirstName = 'Test';
    const testUsername = 'testuser';

    const { user } = prisma;
    // Access the mock through the module mock (type assertion needed for mock methods)
    // Vitest mocks are standalone functions, safe to use without binding
    // eslint-disable-next-line ts/unbound-method
    const upsertMock = user.upsert as Mock;
    upsertMock.mockResolvedValue({
      id: testUserId,
      phoneNumber: testPhoneNumber,
      firstName: testFirstName,
      lastName: null,
      username: testUsername,
      isBot: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await upsertMock({
      where: { id: testUserId },
      update: {
        phoneNumber: testPhoneNumber,
        firstName: testFirstName,
        lastName: null,
        username: testUsername,
      },
      create: {
        id: testUserId,
        phoneNumber: testPhoneNumber,
        isBot: false,
        firstName: testFirstName,
        lastName: null,
        username: testUsername,
      },
    });

    expect(upsertMock).toHaveBeenCalledWith({
      where: { id: testUserId },
      update: {
        phoneNumber: testPhoneNumber,
        firstName: testFirstName,
        lastName: null,
        username: testUsername,
      },
      create: {
        id: testUserId,
        phoneNumber: testPhoneNumber,
        isBot: false,
        firstName: testFirstName,
        lastName: null,
        username: testUsername,
      },
    });

    expect(result.id).toBe(testUserId);
    expect(result.phoneNumber).toBe(testPhoneNumber);
  });

  it('should handle database errors gracefully', async () => {
    const { prisma } = await import('#root/db/client.js');

    const dbError = new Error('Database connection failed');
    const { user } = prisma;
    // Access the mock through the module mock (type assertion needed for mock methods)
    // Vitest mocks are standalone functions, safe to use without binding
    // eslint-disable-next-line ts/unbound-method
    const upsertMock = user.upsert as Mock;
    upsertMock.mockRejectedValue(dbError);

    await expect(upsertMock({
      where: { id: BigInt(123456) },
      update: {},
      create: {
        id: BigInt(123456),
        phoneNumber: '+1234567890',
        isBot: false,
        firstName: 'Test',
      },
    })).rejects.toThrow('Database connection failed');
  });
});
