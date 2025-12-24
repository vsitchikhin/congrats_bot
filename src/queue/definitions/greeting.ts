import { config } from '#root/config.js';
import { Queue } from 'bullmq';

export interface GreetingJobData {
  jobId: string;
}

const connection = {
  host: config.redisHost,
  port: config.redisPort,
};

let greetingQueue: Queue<GreetingJobData> | undefined;

export function getGreetingQueue() {
  if (!greetingQueue) {
    greetingQueue = new Queue<GreetingJobData>('greeting', {
      connection,
    });
  }
  return greetingQueue;
}
