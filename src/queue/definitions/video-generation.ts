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
    });
  }
  return videoGenerationQueue;
}
