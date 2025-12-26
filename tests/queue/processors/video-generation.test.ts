/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/unbound-method */
import type { VideoGenerationJobData } from '#root/queue/definitions/video-generation.js';
import type { Job } from 'bullmq';
import type { Api } from 'grammy';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Prisma client
vi.mock('#root/db/client.js', () => ({
  prisma: {
    videoAsset: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    userRequest: {
      updateMany: vi.fn(),
    },
    systemAsset: {
      findUnique: vi.fn(),
      create: vi.fn(), // Add mock for systemAsset.create
    },
  },
}));

// Mock logger
vi.mock('#root/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(), // Add warn to the mock
  },
}));

// Mock TTS Service
vi.mock('#root/services/tts.js', () => ({
  ttsService: {
    generate: vi.fn().mockResolvedValue('/path/to/mock/audio.mp3'),
  },
}));

// Mock Video Service
vi.mock('#root/services/video.js', () => ({
  videoService: {
    mergeAudioWithVideo: vi.fn().mockResolvedValue('/path/to/mock/video.mp4'),
  },
}));

// Mock InputFile to avoid fs operations in test
vi.mock('grammy', async () => {
  const actualGrammy = await vi.importActual('grammy');
  return {
    ...actualGrammy,
    InputFile: class MockInputFile {
      path: string;
      constructor(path: string) {
        this.path = path;
      }
    },
  };
});

describe('createVideoGenerationProcessor', () => {
  let botApi: Partial<Api>;
  let mockJob: Partial<Job<VideoGenerationJobData>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock Bot API
    botApi = {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendVideo: vi.fn().mockResolvedValue({
        video: { file_id: 'mock-telegram-file-id' },
      }),
      sendPhoto: vi.fn().mockResolvedValue({ photo: [{ file_id: 'mock-coupon-file-id' }] }), // Add sendPhoto to the mock with photo array
    };

    // Mock Job
    mockJob = {
      id: 'test-job-id',
      data: {
        assetId: 'asset-123',
      },
      opts: {
        attempts: 1, // Add attempts to mock job options
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process job successfully and broadcast to all subscribers', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );
    const { ttsService } = await import('#root/services/tts.js');
    const { videoService } = await import('#root/services/video.js');

    const mockAsset = {
      id: 'asset-123',
      name: 'алиса',
      status: 'PENDING',
      userRequests: [
        { userId: BigInt(123456), status: 'PENDING', user: { id: BigInt(123456), firstName: 'User1' } },
        { userId: BigInt(789012), status: 'PENDING', user: { id: BigInt(789012), firstName: 'User2' } },
      ],
    };

    vi.mocked(prisma.videoAsset.update).mockResolvedValue(mockAsset as any);
    vi.mocked(prisma.videoAsset.findUnique).mockResolvedValue(mockAsset as any);
    vi.mocked(prisma.userRequest.updateMany).mockResolvedValue({ count: 2 } as any);

    const processor = createVideoGenerationProcessor(botApi as Api);
    await processor(mockJob as Job<VideoGenerationJobData>);

    // Check that asset status was updated to GENERATING
    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'GENERATING' },
    });

    // Check that video was generated
    expect(ttsService.generate).toHaveBeenCalledWith('алиса');
    expect(videoService.mergeAudioWithVideo).toHaveBeenCalledWith('/path/to/mock/audio.mp3');

    // Check that video was sent to first user and file_id was captured
    expect(botApi.sendVideo).toHaveBeenCalledWith(
      123456,
      expect.objectContaining({ path: '/path/to/mock/video.mp4' }),
      expect.any(Object),
    );

    // Check that asset was updated with file_id
    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'AVAILABLE', telegramFileId: 'mock-telegram-file-id' },
    });

    // Check that all subscribers received messages
    expect(botApi.sendMessage).toHaveBeenCalledTimes(2);

    // Check that all requests were marked as COMPLETED
    expect(prisma.userRequest.updateMany).toHaveBeenCalledWith({
      where: { assetId: 'asset-123', status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });
  });

  it('should handle case when VideoAsset is not found', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    vi.mocked(prisma.videoAsset.findUnique).mockResolvedValue(null);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'VideoAsset asset-123 not found in database',
    );

    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'GENERATING' },
    });
    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle database errors and update status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const dbError = new Error('Database connection failed');
    vi.mocked(prisma.videoAsset.findUnique).mockRejectedValue(dbError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'Database connection failed',
    );

    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle sendVideo errors and update status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const mockAsset = {
      id: 'asset-123',
      name: 'алиса',
      userRequests: [
        { userId: BigInt(123456), status: 'PENDING', user: { id: BigInt(123456) } },
      ],
    };

    vi.mocked(prisma.videoAsset.findUnique).mockResolvedValue(mockAsset as any);
    vi.mocked(prisma.videoAsset.update).mockResolvedValue(mockAsset as any);

    const sendVideoError = new Error('Failed to send video');
    vi.mocked(botApi.sendVideo as Mock).mockRejectedValue(sendVideoError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow('Failed to send video');

    expect(prisma.videoAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle errors when updating status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { logger } = await import('#root/logger.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const dbError = new Error('Database connection failed');
    const updateError = new Error('Failed to update status');

    vi.mocked(prisma.videoAsset.update)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(updateError);

    vi.mocked(prisma.videoAsset.findUnique).mockRejectedValue(dbError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'Database connection failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: updateError,
        assetId: 'asset-123',
      }),
      expect.stringContaining('Failed to update status'),
    );
  });
});
