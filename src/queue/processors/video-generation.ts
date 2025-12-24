import type { VideoGenerationJobData } from '#root/queue/definitions/video-generation.js';
import type { Job } from 'bullmq';
import type { Bot } from 'grammy';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';

/**
 * Creates a processor function for the video-generation queue.
 * The processor handles video generation jobs and sends the result to users.
 *
 * @param botApi The Bot API instance for sending messages to users.
 * @returns A processor function that will be called by the worker for each job.
 */
export function createVideoGenerationProcessor(botApi: Bot['api']) {
  return async (job: Job<VideoGenerationJobData>) => {
    const { jobId } = job.data;

    try {
      logger.info(`Processing job ${jobId}...`);

      // 1. Update job status to PROCESSING
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });

      // 2. Get job details from database
      const videoJob = await prisma.videoJob.findUnique({
        where: { id: jobId },
        include: { user: true },
      });

      if (!videoJob) {
        throw new Error(`VideoJob ${jobId} not found in database`);
      }

      // 3. TODO (Task 4.1): Generate audio using TTS service
      // const audioPath = await ttsService.generate(videoJob.childName);

      // 4. TODO (Task 4.2): Generate video using video service
      // const videoPath = await videoService.merge(audioPath);

      // 5. Simulate video generation work (will be replaced by actual services)
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay

      // 6. TODO (Task 5.1): Send video to user
      // await botApi.sendVideo(videoJob.userId, new InputFile(videoPath), {
      //   caption: 'Here is your personalized New Year greeting! 🎉',
      // });

      // 7. Update job status to COMPLETED
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED' },
      });

      logger.info(`Job ${jobId} completed successfully!`);

      // Temporary: Send a text message to notify completion (will be replaced by actual video)
      await botApi.sendMessage(
        // @ts-expect-error bigint to number conversion
        Number.parseInt(videoJob.userId),
        `Your video greeting for ${videoJob.childName} is ready! (This is a placeholder - actual video will be sent in future tasks)`,
      );
    }
    catch (error) {
      logger.error({ error, jobId }, `Job ${jobId} failed`);

      // Mark job as FAILED in database
      try {
        await prisma.videoJob.update({
          where: { id: jobId },
          data: { status: 'FAILED' },
        });
      }
      catch (updateError) {
        logger.error({ error: updateError, jobId }, `Failed to update job ${jobId} status to FAILED`);
      }

      // Re-throw error for BullMQ retry logic
      throw error;
    }
  };
}
