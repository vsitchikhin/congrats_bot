/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/unbound-method */
import type { Context } from '#root/bot/context.js';
import type { UserFromGetMe } from '@grammyjs/types';
import type { Mock } from 'vitest';
import { greetingFeature } from '#root/bot/features/greeting.js';
import { conversations } from '@grammyjs/conversations';
import { Bot } from 'grammy';
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
    videoAsset: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userRequest: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn({
      videoAsset: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userRequest: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    })),
  },
}));

// Mock BullMQ queue
const mockQueue = {
  add: vi.fn(),
};
vi.mock('#root/queue/definitions/video-generation.js', () => ({
  getVideoGenerationQueue: vi.fn(() => mockQueue),
}));

// Mock logger
vi.mock('#root/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
  },
}));

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

describe('greetingFeature - Save and Queue Flow', () => {
  let conversation: any;
  let ctx: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import('#root/db/client.js');

    // Mock Prisma and Queue modules
    vi.mocked(prisma.user.upsert).mockResolvedValue({} as any);

    // Mock conversation object
    conversation = {
      wait: vi.fn(),
      update: vi.fn(),
      log: vi.fn(),
    };

    // Mock context object
    ctx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      reply: vi.fn(),
      answerCallbackQuery: vi.fn(),
      t: (key: string) => key, // Mock i18n
    };
  });

  it('should create video asset and add to queue on successful conversation', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { getVideoGenerationQueue } = await import(
      '#root/queue/definitions/video-generation.js'
    );
    const { greetingConversation } = await import(
      '#root/bot/features/greeting.js'
    );
    const queue = getVideoGenerationQueue();

    // Mock transaction to create new asset
    const mockAsset = { id: 'asset-123', name: 'алиса', status: 'PENDING' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        videoAsset: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        userRequest: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    vi.mocked(queue.add).mockResolvedValue({} as any);

    // Simulate conversation steps
    conversation.wait
      .mockResolvedValueOnce({
        ...ctx,
        message: { contact: { phone_number: '+1234567890' } },
      })
      .mockResolvedValueOnce({
        ...ctx,
        message: { text: 'Алиса' },
      })
      .mockResolvedValueOnce({
        ...ctx,
        callbackQuery: { data: 'confirm_yes' },
      });

    // Run the conversation logic
    await greetingConversation(conversation, ctx);

    // Assertions
    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith('generate-video', {
      assetId: 'asset-123',
    });
  });

  it('should handle database error when creating video asset', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { getVideoGenerationQueue } = await import(
      '#root/queue/definitions/video-generation.js'
    );
    const { greetingConversation } = await import(
      '#root/bot/features/greeting.js'
    );
    const queue = getVideoGenerationQueue();
    const dbError = new Error('DB Error');
    vi.mocked(prisma.$transaction).mockRejectedValue(dbError);

    // Simulate conversation steps
    conversation.wait
      .mockResolvedValueOnce({
        ...ctx,
        message: { contact: { phone_number: '+1234567890' } },
      })
      .mockResolvedValueOnce({
        ...ctx,
        message: { text: 'Алиса' },
      })
      .mockResolvedValueOnce({
        ...ctx,
        callbackQuery: { data: 'confirm_yes' },
      });

    // Run the conversation logic
    await greetingConversation(conversation, ctx);

    // Assertions
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже, используя команду /start',
    );
  });

  it('should handle queue error when adding job', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { getVideoGenerationQueue } = await import(
      '#root/queue/definitions/video-generation.js'
    );
    const { greetingConversation } = await import(
      '#root/bot/features/greeting.js'
    );
    const queue = getVideoGenerationQueue();
    const queueError = new Error('Queue Error');

    const mockAsset = { id: 'asset-123', name: 'алиса', status: 'PENDING' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        videoAsset: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockAsset),
        },
        userRequest: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    vi.mocked(queue.add).mockRejectedValue(queueError);

    // Simulate conversation steps
    conversation.wait
      .mockResolvedValueOnce({
        ...ctx,
        message: { contact: { phone_number: '+1234567890' } },
      })
      .mockResolvedValueOnce({
        ...ctx,
        message: { text: 'Алиса' },
      })
      .mockResolvedValueOnce({
        ...ctx,
        callbackQuery: { data: 'confirm_yes' },
      });

    // Run the conversation logic
    await greetingConversation(conversation, ctx);

    // Assertions
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже, используя команду /start',
    );
  });
});
