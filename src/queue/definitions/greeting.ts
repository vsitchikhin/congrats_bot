import { config } from '#root/config.js';
import { Queue } from 'bullmq';

// The data for a job in the greeting queue will be the ID of the VideoJob in the database.
export interface GreetingJobData {
  jobId: string;
}

const connection = {
  host: config.redisHost,
  port: config.redisPort,
};

// This queue will be used to process video greeting generation jobs.
export const greetingQueue = new Queue<GreetingJobData>('greeting', {
  connection,
});
