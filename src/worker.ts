import type { Api } from 'grammy';
import { config } from '#root/config.js';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { createVideoGenerationProcessor } from '#root/queue/processors/video-generation.js';
import { Worker } from 'bullmq';
import { Bot, InlineKeyboard } from 'grammy';

/**
 * Sends error notification to user with retry button
 */
async function sendErrorNotification(api: Api, userId: number, assetId: string) {
  const keyboard = new InlineKeyboard().text(
    '🔄 Попробовать еще раз',
    `retry_video_${assetId}`,
  );

  await api.sendMessage(
    userId,
    '❌ К сожалению, не удалось создать видео из-за проблем на стороннем сервере.\n\n'
    + 'Вы можете попробовать еще раз, нажав на кнопку ниже:',
    { reply_markup: keyboard },
  );
}

logger.info('Starting worker...');

const connection = {
  host: config.redisHost,
  port: config.redisPort,
};

// Initialize bot instance for sending messages from worker
const bot = new Bot(config.botToken);

// The worker is responsible for processing jobs from the queue.
const worker = new Worker('video-generation', createVideoGenerationProcessor(bot.api), {
  connection,
  autorun: true,
  concurrency: 5, // Process up to 5 jobs at once
});

// Event handlers
worker.on('active', (job) => {
  logger.info(`Job ${job.id} started processing`);
});

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

worker.on('failed', async (job, err) => {
  if (!job) {
    logger.error(`A job failed with error: ${err.message}`);
    return;
  }

  logger.error(
    {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      attemptsLimit: job.opts.attempts,
      error: err.message,
    },
    `Job ${job.id} failed`,
  );

  // Check if this is a permanent failure (all retries exhausted)
  if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
    logger.error({ jobId: job.id }, '❌ Job failed permanently after all retries');

    // Send error notification to user with retry button
    try {
      const jobData = job.data;
      const assetId = jobData.assetId;

      // Get all pending requests for this asset
      const requests = await prisma.userRequest.findMany({
        where: { assetId, status: 'PENDING' },
        include: { user: true },
      });

      // Send notification to each user
      for (const request of requests) {
        const userId = Number(request.user.id);
        await sendErrorNotification(bot.api, userId, assetId);
      }
    }
    catch (notifyError) {
      logger.error({ error: notifyError }, 'Failed to send error notification to user');
    }
  }
  else {
    logger.info(
      {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        attemptsLimit: job.opts.attempts,
      },
      `Job will be retried (attempt ${(job.attemptsMade ?? 0) + 1}/${job.opts.attempts ?? 1})`,
    );
  }
});

worker.on('error', (err) => {
  logger.error({ error: err }, 'Worker error');
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Shutting down worker gracefully...');
  await worker.close();
  logger.info('Worker closed successfully');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

logger.info('Worker started and listening for jobs.');
