import type { Api } from 'grammy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { InputFile } from 'grammy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sends coupons to a user.
 * On first send, uploads the images and caches their file_id in the database.
 * On subsequent sends, uses the cached file_id for instant delivery.
 *
 * @param botApi The Bot API instance
 * @param userId The user's chat ID
 * @param enabled Whether to send coupons (controlled by config)
 */
export async function sendCoupons(botApi: Api, userId: number, enabled: boolean = true) {
  if (!enabled) {
    logger.info('Coupons disabled in config, skipping');
    return;
  }

  const couponKeys = ['coupon1', 'coupon2'];
  const assetsDir = path.resolve(__dirname, '../../../assets');

  for (const key of couponKeys) {
    // Check if we have a cached file_id
    const systemAsset = await prisma.systemAsset.findUnique({
      where: { key },
    });

    let fileId: string;

    if (systemAsset?.telegramFileId !== undefined && systemAsset.telegramFileId !== null && systemAsset.telegramFileId !== '') {
      // Use cached file_id
      fileId = systemAsset.telegramFileId;
      logger.info({ key, fileId }, 'Using cached coupon file_id');
    }
    else {
      // Upload the file for the first time
      const couponPath = path.join(assetsDir, `${key}.jpeg`);
      logger.info({ key, couponPath }, 'Uploading coupon for the first time');

      const message = await botApi.sendPhoto(
        userId,
        new InputFile(couponPath),
      );

      fileId = message.photo[message.photo.length - 1].file_id;

      // Save file_id to database
      if (systemAsset) {
        await prisma.systemAsset.update({
          where: { key },
          data: { telegramFileId: fileId },
        });
      }
      else {
        await prisma.systemAsset.create({
          data: { key, telegramFileId: fileId },
        });
      }

      logger.info({ key, fileId }, 'Coupon file_id cached in database');
      continue; // Already sent during upload
    }

    // Send using cached file_id
    await botApi.sendPhoto(userId, fileId);
  }
}

export const couponsService = {
  sendCoupons,
};
