import type { VideoGenerationJobData } from '#root/queue/definitions/video-generation.js';
import type { Job } from 'bullmq';
import type { Bot } from 'grammy';
import { unlink } from 'node:fs/promises';
import { config } from '#root/config.js';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { sendCoupons } from '#root/services/coupons.js';
import { ttsService } from '#root/services/tts.js';
import { videoService } from '#root/services/video.js';
import { InlineKeyboard, InputFile } from 'grammy';

/**
 * Creates a processor function for the video-generation queue.
 * The processor handles video generation for VideoAssets and broadcasts to all subscribers.
 *
 * @param botApi The Bot API instance for sending messages to users.
 * @returns A processor function that will be called by the worker for each job.
 */
export function createVideoGenerationProcessor(botApi: Bot['api']) {
  return async (job: Job<VideoGenerationJobData>) => {
    const { assetId } = job.data;

    let audioPath: string | undefined;
    let videoPath: string | undefined;

    try {
      logger.info({ assetId }, `Processing VideoAsset ${assetId}...`);

      // 1. Update asset status to GENERATING
      await prisma.videoAsset.update({
        where: { id: assetId },
        data: { status: 'GENERATING' },
      });

      // 2. Get asset and all pending subscribers
      const asset = await prisma.videoAsset.findUnique({
        where: { id: assetId },
        include: {
          userRequests: {
            where: { status: 'PENDING' },
            include: { user: true },
          },
        },
      });

      if (!asset) {
        throw new Error(`VideoAsset ${assetId} not found in database`);
      }

      if (asset.userRequests.length === 0) {
        logger.warn({ assetId }, 'No pending user requests for this asset');
        // Mark asset as AVAILABLE anyway so it can be used later
        await prisma.videoAsset.update({
          where: { id: assetId },
          data: { status: 'AVAILABLE' },
        });
        return;
      }

      logger.info({ assetId, subscribersCount: asset.userRequests.length, name: asset.name }, `Generating video for ${asset.userRequests.length} subscriber(s)`);

      // 3. Generate audio using TTS service (uses normalized name)
      audioPath = await ttsService.generate(asset.name);

      // 4. Generate video using video service
      videoPath = await videoService.mergeAudioWithVideo(audioPath);

      // 4.1. Clean up temporary audio file immediately after merging
      try {
        await unlink(audioPath);
        logger.debug({ audioPath }, 'Deleted temporary audio file after merging');
      }
      catch (unlinkError) {
        logger.debug({ error: unlinkError }, 'Could not delete temp audio file');
      }

      // 5. Send video to first user and capture file_id from Telegram
      const firstUser = asset.userRequests[0];
      logger.info({ assetId, userId: firstUser.userId }, 'Sending video to first subscriber and capturing file_id');

      const message = await botApi.sendVideo(
        Number.parseInt(firstUser.userId.toString()),
        new InputFile(videoPath),
        {
          width: 1920,
          height: 1080,
        },
      );

      const fileId = message.video?.file_id;
      if (!fileId) {
        throw new Error('Failed to get file_id from Telegram response');
      }

      logger.info({ assetId, fileId }, '✅ Video uploaded to Telegram, got file_id for caching');

      // 5.1. Send coupons and completion message to first user immediately after video
      const keyboard = new InlineKeyboard()
        .text('🎄 Заказать еще одно видео', 'order_another_video');

      await sendCoupons(botApi, Number.parseInt(firstUser.userId.toString()), config.sendCoupons);

      const capitalizedName = asset.name.charAt(0).toUpperCase() + asset.name.slice(1);
      await botApi.sendMessage(
        Number.parseInt(firstUser.userId.toString()),
        `Ваша новогодняя открытка для <b>${capitalizedName}</b> готова! 🎁`,
        {
          reply_markup: keyboard,
          parse_mode: 'HTML',
        },
      );

      // 6. Update asset with file_id and mark as AVAILABLE
      await prisma.videoAsset.update({
        where: { id: assetId },
        data: {
          status: 'AVAILABLE',
          telegramFileId: fileId,
        },
      });

      // 7. Send to remaining users using cached file_id (instant delivery!)
      for (let i = 1; i < asset.userRequests.length; i++) {
        const userRequest = asset.userRequests[i];
        logger.info({ assetId, userId: userRequest.userId }, `Sending cached video to subscriber ${i + 1}/${asset.userRequests.length}`);

        await botApi.sendVideo(
          Number.parseInt(userRequest.userId.toString()),
          fileId, // Use cached file_id - no re-upload needed!
          {
            width: 1920,
            height: 1080,
          },
        );

        // Send coupons after video
        await sendCoupons(botApi, Number.parseInt(userRequest.userId.toString()), config.sendCoupons);

        await botApi.sendMessage(
          Number.parseInt(userRequest.userId.toString()),
          `Ваша новогодняя открытка <b>${capitalizedName}</b> готова! 🎁`,
          {
            reply_markup: keyboard,
            parse_mode: 'HTML',
          },
        );
      }

      // 8. Mark all UserRequests as COMPLETED
      await prisma.userRequest.updateMany({
        where: {
          assetId,
          status: 'PENDING',
        },
        data: {
          status: 'COMPLETED',
        },
      });

      logger.info({ assetId, subscribersCount: asset.userRequests.length }, `✅ Video generation completed and delivered to ${asset.userRequests.length} subscriber(s)`);

      // 9. Clean up temporary video file after successful delivery
      try {
        await unlink(videoPath);
        logger.debug({ videoPath }, 'Deleted temporary video file after successful delivery');
      }
      catch (unlinkError) {
        // Don't fail the job if we can't delete the temp file
        logger.warn({ error: unlinkError, videoPath }, 'Failed to delete temporary video file');
      }
    }
    catch (error) {
      // Add attempt information for better debugging
      const currentAttempt = (job.attemptsMade ?? 0) + 1;
      const maxAttempts = job.opts.attempts ?? 1;
      const attemptInfo = `(attempt ${currentAttempt}/${maxAttempts})`;

      logger.error(
        { error, assetId, attemptInfo },
        `❌ VideoAsset ${assetId} generation failed ${attemptInfo}`,
      );

      // Only mark as FAILED if this is the final retry attempt
      // Otherwise, let BullMQ retry with PENDING status intact
      const isFinalAttempt = currentAttempt >= maxAttempts;

      if (isFinalAttempt) {
        logger.warn({ assetId }, 'Final retry attempt failed, marking as FAILED');

        try {
          await prisma.videoAsset.update({
            where: { id: assetId },
            data: { status: 'FAILED' },
          });

          await prisma.userRequest.updateMany({
            where: {
              assetId,
              status: 'PENDING',
            },
            data: {
              status: 'FAILED',
            },
          });

          logger.info({ assetId }, 'Marked asset and all pending requests as FAILED');

          // Notify all affected users about the failure
          // Re-fetch asset with failed user requests to get updated data
          const failedAsset = await prisma.videoAsset.findUnique({
            where: { id: assetId },
            include: {
              userRequests: {
                where: { status: 'FAILED' },
              },
            },
          });

          if (failedAsset && failedAsset.userRequests.length > 0) {
            logger.info({ assetId, usersCount: failedAsset.userRequests.length }, 'Sending failure notifications to users');

            for (const userRequest of failedAsset.userRequests) {
              try {
                const keyboard = new InlineKeyboard()
                  .text('🔄 Попробовать еще раз', `retry_video_${assetId}`);

                await botApi.sendMessage(
                  Number.parseInt(userRequest.userId.toString()),
                  `Упс! Что-то пошло не так при создании видео для <b>${failedAsset.name}</b>. 😔\n\nНе переживайте, вы можете попробовать еще раз!`,
                  {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                  },
                );

                logger.info({ userId: userRequest.userId, assetId }, '📨 Sent failure notification with retry button');
              }
              catch (notifyError) {
                // Don't fail the whole process if we can't notify one user
                logger.error(
                  { error: notifyError, userId: userRequest.userId, assetId },
                  'Failed to send failure notification to user',
                );
              }
            }
          }
        }
        catch (updateError) {
          logger.error({ error: updateError, assetId }, 'Failed to update status to FAILED');
        }
      }
      else {
        logger.info({ assetId, nextAttempt: currentAttempt + 1 }, 'Will retry - keeping PENDING status');
      }

      // Clean up any temporary files that may have been created
      if (audioPath !== undefined) {
        try {
          await unlink(audioPath);
          logger.debug({ audioPath }, 'Deleted temporary audio file after error');
        }
        catch (unlinkError) {
          logger.debug({ error: unlinkError }, 'Could not delete temp audio file');
        }
      }

      if (videoPath !== undefined) {
        try {
          await unlink(videoPath);
          logger.debug({ videoPath }, 'Deleted temporary video file after error');
        }
        catch (unlinkError) {
          logger.debug({ error: unlinkError }, 'Could not delete temp video file');
        }
      }

      // Re-throw error for BullMQ retry logic
      throw error;
    }
  };
}
