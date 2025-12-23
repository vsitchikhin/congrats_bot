import { config } from '#root/config.js';
import { logger } from '#root/logger.js';
import { greetingProcessor } from '#root/queue/processors/greeting.js';
import { Worker } from 'bullmq';

logger.info('Starting worker...');

const connection = {
  host: config.redisHost,
  port: config.redisPort,
};

// The worker is responsible for processing jobs from the queue.
const worker = new Worker('greeting', greetingProcessor, {
  connection,
  autorun: true,
});

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} has completed.`);
});

worker.on('failed', (job, err) => {
  if (job) {
    logger.error(`Job ${job.id} has failed with ${err.message}.`);
  }
  else {
    logger.error(`A job has failed with ${err.message}.`);
  }
});

logger.info('Worker started and listening for jobs.');
