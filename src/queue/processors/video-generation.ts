import type { VideoGenerationJobData } from '#root/queue/definitions/video-generation.js';
import type { Job } from 'bullmq';
import type { Bot } from 'grammy';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
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
      const audioPath = await ttsService.generate(asset.name);

      // 4. Generate video using video service
      const videoPath = await videoService.mergeAudioWithVideo(audioPath);

      // 5. Send video to first user and capture file_id from Telegram
      const firstUser = asset.userRequests[0];
      logger.info({ assetId, userId: firstUser.userId }, 'Sending video to first subscriber and capturing file_id');

      const message = await botApi.sendVideo(
        Number.parseInt(firstUser.userId.toString()),
        new InputFile(videoPath),
        {
          caption: 'Вот ваше персональное новогоднее поздравление! 🎉',
          width: 1920,
          height: 1080,
        },
      );

      const fileId = message.video?.file_id;
      if (!fileId) {
        throw new Error('Failed to get file_id from Telegram response');
      }

      logger.info({ assetId, fileId }, '✅ Video uploaded to Telegram, got file_id for caching');

      // 6. Update asset with file_id and mark as AVAILABLE
      await prisma.videoAsset.update({
        where: { id: assetId },
        data: {
          status: 'AVAILABLE',
          telegramFileId: fileId,
        },
      });

      // 7. Send to remaining users using cached file_id (instant delivery!)
      const keyboard = new InlineKeyboard()
        .text('🎄 Заказать еще одно видео', 'order_another_video');

      for (let i = 1; i < asset.userRequests.length; i++) {
        const userRequest = asset.userRequests[i];
        logger.info({ assetId, userId: userRequest.userId }, `Sending cached video to subscriber ${i + 1}/${asset.userRequests.length}`);

        await botApi.sendVideo(
          Number.parseInt(userRequest.userId.toString()),
          fileId, // Use cached file_id - no re-upload needed!
          {
            caption: 'Вот ваше персональное новогоднее поздравление! 🎉',
            width: 1920,
            height: 1080,
          },
        );

        await botApi.sendMessage(
          Number.parseInt(userRequest.userId.toString()),
          `Ваше видеопоздравление для ${asset.name} готово! 🎊`,
          { reply_markup: keyboard },
        );
      }

      // Send completion message to first user too
      await botApi.sendMessage(
        Number.parseInt(firstUser.userId.toString()),
        `Ваше видеопоздравление для ${asset.name} готово! 🎊`,
        { reply_markup: keyboard },
      );

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
    }
    catch (error) {
      logger.error({ error, assetId }, `❌ VideoAsset ${assetId} generation failed`);

      // Mark asset and all pending requests as FAILED
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
      }
      catch (updateError) {
        logger.error({ error: updateError, assetId }, 'Failed to update status to FAILED');
      }

      // Re-throw error for BullMQ retry logic
      throw error;
    }
  };
}
