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

describe('createVideoGenerationProcessor', () => {
  let botApi: Partial<Api>;
  let mockJob: Partial<Job<VideoGenerationJobData>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock Bot API
    botApi = {
      sendMessage: vi.fn().mockResolvedValue({}),
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

    const mockVideoJob = {
      id: 'video-job-123',
      userId: BigInt(123456),
      childName: 'Алиса',
      phoneNumber: '+1234567890',
      status: 'PROCESSING',
      generatedVideoPath: null,
      tgFileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: BigInt(123456),
        firstName: 'Test',
        lastName: null,
        username: 'testuser',
        phoneNumber: '+1234567890',
        isBot: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(mockVideoJob as any);
    vi.mocked(prisma.videoJob.update).mockResolvedValue(mockVideoJob as any);

    const processor = createVideoGenerationProcessor(botApi as Api);
    const processorPromise = processor(mockJob as Job<VideoGenerationJobData>);

    // Fast-forward timers to skip the 5-second delay
    await vi.advanceTimersByTimeAsync(5000);
    await processorPromise;

    // Verify status was updated to PROCESSING
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'PROCESSING' },
    });

    // Verify video job was fetched
    expect(prisma.videoJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      include: { user: true },
    });

    // Verify status was updated to COMPLETED
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'COMPLETED' },
    });

    // Verify message was sent to user
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

    // Verify status was updated to PROCESSING
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'PROCESSING' },
    });

    // Verify status was updated to FAILED
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

    // Verify status was updated to FAILED
    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'video-job-123' },
      data: { status: 'FAILED' },
    });
  });

  it('should handle sendMessage errors and update status to FAILED', async () => {
    const { prisma } = await import('#root/db/client.js');
    const { createVideoGenerationProcessor } = await import(
      '#root/queue/processors/video-generation.js'
    );

    const mockVideoJob = {
      id: 'video-job-123',
      userId: BigInt(123456),
      childName: 'Алиса',
      phoneNumber: '+1234567890',
      status: 'PROCESSING',
      generatedVideoPath: null,
      tgFileId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: BigInt(123456),
        firstName: 'Test',
        lastName: null,
        username: 'testuser',
        phoneNumber: '+1234567890',
        isBot: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(mockVideoJob as any);
    vi.mocked(prisma.videoJob.update).mockResolvedValue(mockVideoJob as any);

    const sendMessageError = new Error('Failed to send message');
    vi.mocked(botApi.sendMessage as Mock).mockRejectedValue(sendMessageError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    // Start processor (catch to prevent unhandled rejection warning)
    const processorPromise = processor(mockJob as Job<VideoGenerationJobData>).catch(err => err);

    // Fast-forward timers to skip the 5-second delay
    await vi.advanceTimersByTimeAsync(5000);

    // Now verify the error was thrown
    const result = await processorPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Failed to send message');

    // Verify status was updated to FAILED
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
      .mockResolvedValueOnce({} as any) // First call for PROCESSING status
      .mockRejectedValueOnce(updateError); // Second call fails when trying to set FAILED

    vi.mocked(prisma.videoJob.findUnique).mockRejectedValue(dbError);

    const processor = createVideoGenerationProcessor(botApi as Api);

    await expect(processor(mockJob as Job<VideoGenerationJobData>)).rejects.toThrow(
      'Database connection failed',
    );

    // Verify error was logged
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: updateError,
        jobId: 'video-job-123',
      }),
      expect.stringContaining('Failed to update job video-job-123 status to FAILED'),
    );
  });
});
