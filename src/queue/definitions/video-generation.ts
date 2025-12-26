import { config } from '#root/config.js';
import { Queue } from 'bullmq';

export interface VideoGenerationJobData {
  assetId: string;
}

const connection = {
  host: config.redisHost,
  port: config.redisPort,
};

let videoGenerationQueue: Queue<VideoGenerationJobData> | undefined;

export function getVideoGenerationQueue() {
  if (!videoGenerationQueue) {
    videoGenerationQueue = new Queue<VideoGenerationJobData>('video-generation', {
      connection,
      defaultJobOptions: {
        attempts: 3, // Total 3 attempts
        backoff: {
          type: 'exponential',
          delay: 2000, // Initial delay 2 seconds (2s, 4s)
        },
        removeOnComplete: {
          age: 24 * 3600, // Remove successful jobs after 24 hours
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
        },
      },
    });
  }
  return videoGenerationQueue;
}
