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
    videoJob: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('#root/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock TTS Service
vi.mock('#root/services/tts.js', () => ({
  ttsService: {
    generate: vi.fn().mockResolvedValue('/path/to/mock/audio.mp3'),
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
      sendAudio: vi.fn().mockResolvedValue({}),
    };

    // Mock Job
    mockJob = {
      id: 'test-job-id',
      data: {
        jobId: 'video-job-123',
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process job successfully and update status to COMPLETED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );
    const { ttsService } = await import('#root/services/tts.js');

    const mockVideoJob = {
      id: 'video-job-123',
      userId: BigInt(123456),
      childName: 'Алиса',
      phoneNumber: '+1234567890',
      status: 'PROCESSING',
      user: {
        id: BigInt(123456),
        firstName: 'Test',
      },
    };

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(mockVideoJob as any);
    vi.mocked(prisma.videoJob.update).mockResolvedValue(mockVideoJob as any);

    const processor = createVideoGenerationProcessor(botApi as Api);
    await processor(mockJob as Job<VideoGenerationJobData>);

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'PROCESSING' },
    });
    expect(prisma.videoJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      include: { user: true },
    });
    expect(ttsService.generate).toHaveBeenCalledWith('Алиса');
    expect(botApi.sendAudio).toHaveBeenCalledWith(123456, expect.objectContaining({ path: '/path/to/mock/audio.mp3' }));
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'COMPLETED' },
    });
    expect(botApi.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining('Алиса'),
    );
  });

  it('should handle case when VideoJob is not found', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'VideoJob video-job-123 not found in database',
    );

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'PROCESSING' },
    });
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle database errors and update status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const dbError = new Error('Database connection failed');
    vi.mocked(prisma.videoJob.findUnique).mockRejectedValue(dbError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'Database connection failed',
    );

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle sendAudio errors and update status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const mockVideoJob = {
      id: 'video-job-123',
      userId: BigInt(123456),
      childName: 'Алиса',
      user: { id: BigInt(123456) },
    };

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(mockVideoJob as any);
    vi.mocked(prisma.videoJob.update).mockResolvedValue(mockVideoJob as any);

    const sendAudioError = new Error('Failed to send audio');
    vi.mocked(botApi.sendAudio as Mock).mockRejectedValue(sendAudioError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow('Failed to send audio');

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
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

    vi.mocked(prisma.videoJob.update)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(updateError);

    vi.mocked(prisma.videoJob.findUnique).mockRejectedValue(dbError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'Database connection failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: updateError,
        jobId: 'video-job-123',
      }),
      expect.stringContaining('Failed to update job video-job-123 status to FAILED'),
    );
  });
});
