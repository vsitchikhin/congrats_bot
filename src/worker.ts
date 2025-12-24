import { config } from '#root/config.js';
import { logger } from '#root/logger.js';
import { createVideoGenerationProcessor } from '#root/queue/processors/video-generation.js';
import { Worker } from 'bullmq';
import { Bot } from 'grammy';

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

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`Job ${job.id} failed with error: ${err.message}`);
  }
  else {
    logger.error(`A job failed with error: ${err.message}`);
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
