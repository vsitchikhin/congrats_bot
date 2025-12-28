import type { BaseContext, Context } from '#root/bot/context.js';
import type { Conversation } from '@grammyjs/conversations';
import type { Prisma } from '@prisma/client';
import { config } from '#root/config.js';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { getVideoGenerationQueue } from '#root/queue/definitions/video-generation.js';
import { sendCoupons } from '#root/services/coupons.js';
import { profanityFilter } from '#root/services/profanity-filter.js';
import { createConversation } from '@grammyjs/conversations';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';

const composer = new Composer<Context>();

const GREETING_CONVERSATION_NAME = 'greeting';

// Cache duration: 7 days in milliseconds
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Helper to check if cache is expired (7 days)
function isCacheExpired(createdAt: Date): boolean {
  const now = new Date();
  return now.getTime() - createdAt.getTime() > CACHE_DURATION_MS;
}

// Helper to normalize child name (lowercase for uniqueness)
function normalizeChildName(name: string): string {
  return name.trim().toLowerCase();
}

// Result type for video request handling
interface VideoRequestResult {
  type: 'send_cached' | 'subscribed' | 'generate';
  fileId?: string;
  assetId?: string;
  assetName?: string;
}

// Main function to handle video request with caching and deduplication
async function handleVideoRequest(
  userId: bigint,
  childName: string,
  childAge?: number,
): Promise<VideoRequestResult> {
  const normalizedName = normalizeChildName(childName);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Find existing VideoAsset for this name
    let asset = await tx.videoAsset.findUnique({
      where: { name: normalizedName },
    });

    let shouldGenerateVideo = false;

    if (!asset) {
      // Asset doesn't exist - create new one
      asset = await tx.videoAsset.create({
        data: {
          name: normalizedName,
          status: 'PENDING',
        },
      });
      shouldGenerateVideo = true;
      logger.info({ userId, assetId: asset.id, childName, normalizedName }, '🆕 New VideoAsset created');
    }
    else {
      // Asset exists - check its status and cache validity
      logger.info({ userId, assetId: asset.id, status: asset.status, childName }, '📦 Found existing VideoAsset');

      if (asset.status === 'AVAILABLE' && asset.telegramFileId !== null && !isCacheExpired(asset.createdAt)) {
        // Cache hit! Video is ready and not expired
        logger.info({ userId, assetId: asset.id, childName }, '⚡ Cache hit - video ready for instant delivery');

        // Create UserRequest as COMPLETED
        await tx.userRequest.create({
          data: {
            userId,
            assetId: asset.id,
            status: 'COMPLETED',
            childAge,
          },
        });

        return {
          type: 'send_cached' as const,
          fileId: asset.telegramFileId,
          assetName: asset.name,
        };
      }
      else if (asset.status === 'PENDING' || asset.status === 'GENERATING') {
        // Video is currently being generated - subscribe to result
        logger.info({ userId, assetId: asset.id, childName }, '🔔 Video is being generated - subscribing user');

        await tx.userRequest.create({
          data: {
            userId,
            assetId: asset.id,
            status: 'PENDING',
            childAge,
          },
        });

        return { type: 'subscribed' as const };
      }
      else if (asset.status === 'FAILED' || (asset.status === 'AVAILABLE' && isCacheExpired(asset.createdAt))) {
        // Video generation failed or cache expired - regenerate
        const reason = asset.status === 'FAILED' ? 'failed' : 'expired';
        logger.info({ userId, assetId: asset.id, childName, reason }, '🔄 Regenerating video');

        // Reset asset to PENDING and clear old file_id
        await tx.videoAsset.update({
          where: { id: asset.id },
          data: {
            status: 'PENDING',
            telegramFileId: null,
          },
        });

        shouldGenerateVideo = true;
      }
    }

    // Create UserRequest for new generation or regeneration
    await tx.userRequest.create({
      data: {
        userId,
        assetId: asset.id,
        status: 'PENDING',
        childAge,
      },
    });

    if (shouldGenerateVideo) {
      return { type: 'generate' as const, assetId: asset.id };
    }

    // This shouldn't happen, but just in case
    return { type: 'subscribed' as const };
  }, {
    isolationLevel: 'Serializable', // Prevent race conditions
  });
}

// Note: Removed in-memory Sets/Maps (activeConversations, reorderingUsers, orderingWithoutConversation)
// Now using session storage for all state - this allows the bot to scale horizontally

// Validation constants
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
// Using unicode ranges for Cyrillic letters to avoid obscure character range warnings
const VALID_NAME_REGEX = /^[\u0400-\u04FFa-zA-Z\s-]+$/;

// Age validation constants
const MIN_CHILD_AGE = 1;
const MAX_CHILD_AGE = 18;

// Helper to get correct Russian word for "years" (год/года/лет)
function getYearsWord(age: number): string {
  const lastDigit = age % 10;
  const lastTwoDigits = age % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'лет';
  }

  if (lastDigit === 1) {
    return 'год';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'года';
  }

  return 'лет';
}

// Validation helper
interface ValidationResult {
  isValid: boolean;
  errorKey?: string;
}

export function validateChildName(name: string): ValidationResult {
  const trimmedName = name.trim();

  // 1. Length validation
  if (trimmedName.length < MIN_NAME_LENGTH) {
    return { isValid: false, errorKey: 'greeting-name-too-short' };
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    return { isValid: false, errorKey: 'greeting-name-too-long' };
  }

  // 2. Character validation
  if (!VALID_NAME_REGEX.test(trimmedName)) {
    return { isValid: false, errorKey: 'greeting-name-invalid-chars' };
  }

  // 3. Single word validation
  const words = trimmedName.split(/\s+/).filter(word => word.length > 0);
  if (words.length > 1) {
    return { isValid: false, errorKey: 'greeting-name-multiple-words' };
  }

  // 4. Profanity check
  if (profanityFilter.check(trimmedName)) {
    return { isValid: false, errorKey: 'greeting-name-inappropriate' };
  }

  return { isValid: true };
}

// Main conversation function
export async function greetingConversation(
  conversation: Conversation<Context, BaseContext>,
  ctx: BaseContext,
) {
  // Generate unique ID for this conversation run to track it in logs
  const conversationId = Math.random().toString(36).substring(7);
  logger.info({ userId: ctx.from!.id, conversationId }, '🔵 CONVERSATION STARTED');

  // Step 1: Check if user already has phone number in database
  let phoneNumber = '';

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: BigInt(ctx.from!.id) },
      select: { phoneNumber: true },
    });

    if (existingUser && existingUser.phoneNumber !== null) {
      // User already has phone number, use it
      phoneNumber = existingUser.phoneNumber;

      // Only show welcome message if this is NOT a reorder
      if (ctx.session?.isReordering !== true) {
        await ctx.reply('С возвращением! Рады видеть вас снова! 🎄');
      }
      // Clear the reordering flag
      if (ctx.session !== undefined) {
        ctx.session.isReordering = false;
      }
    }
  }
  catch (error) {
    logger.error({ err: error, userId: ctx.from!.id }, 'Failed to check user in database');
  }

  // Step 2: If no phone number exists, ask for it
  if (phoneNumber === '') {
    let phoneReceived = false;

    while (!phoneReceived) {
      // Create keyboard with "Share phone number" button
      const phoneKeyboard = new Keyboard()
        .requestContact('📱 Поделиться номером телефона')
        .resized();

      await ctx.reply('Добро пожаловать в бота "Новогоднее поздравление"! 🎄\n\nПожалуйста, поделитесь своим номером телефона, нажав на кнопку ниже:', {
        reply_markup: phoneKeyboard,
      });

      // Wait for user's response (ignore non-contact messages from worker)
      const phoneCtx = await conversation.waitFor([':contact', 'message:text']);

      // Check for cancellation
      if (phoneCtx.message?.text === '/cancel') {
        await ctx.reply('❌ Диалог отменён. Введите /start для повтора.', {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }

      // Check if user shared contact
      if (phoneCtx.message?.contact) {
        phoneNumber = phoneCtx.message.contact.phone_number;
        phoneReceived = true;

        // Remove keyboard after receiving contact
        await ctx.reply('✅ Спасибо! Номер телефона получен.', {
          reply_markup: { remove_keyboard: true },
        });
      }
      else {
        // User sent text instead of sharing contact
        await ctx.reply('⚠️ Некорректный номер телефона. Пожалуйста, используйте кнопку "Поделиться номером телефона".');
        // Loop will restart and ask for phone again
      }
    }

    // Step 3: Save/update user in database
    try {
      await prisma.user.upsert({
        where: { id: BigInt(ctx.from!.id) },
        update: {
          phoneNumber,
          firstName: ctx.from!.first_name,
          lastName: ctx.from?.last_name ?? null,
          username: ctx.from?.username ?? null,
        },
        create: {
          id: BigInt(ctx.from!.id),
          phoneNumber,
          isBot: ctx.from!.is_bot,
          firstName: ctx.from!.first_name,
          lastName: ctx.from?.last_name ?? null,
          username: ctx.from?.username ?? null,
        },
      });
    }
    catch (error) {
      logger.error({ error, userId: ctx.from!.id }, 'Failed to save user to database');
      await ctx.reply('Произошла ошибка при сохранении данных. Попробуйте еще раз позже.');
      return;
    }
  }

  // Step 4: Ask for child's name (ONE task per conversation)
  let childName = '';
  let isConfirmed = false;

  while (!isConfirmed) {
    await ctx.reply('✨ Введите имя ребенка, для которого создается видеопоздравление:\n\n💡 <i>Если в имени есть буква «ё», используйте именно её — так озвучка будет качественнее!</i>', {
      parse_mode: 'HTML',
    });

    // Wait for user's response (only accept text messages, ignore audio/video from worker)
    const nameCtx = await conversation.waitFor('message:text');

    // Check for cancellation
    if (nameCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Диалог отменён. Введите /start для повтора.');
      logger.info({ userId: ctx.from!.id, conversationId }, '🔴 CONVERSATION CANCELLED');
      return;
    }

    // Get the name from the message
    const inputName = nameCtx.message?.text?.trim();

    // Check if we have text
    if (inputName === undefined || inputName === '') {
      await ctx.reply('⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.');
      continue;
    }

    // Validate the name
    const validation = validateChildName(inputName);

    if (!validation.isValid) {
      const errorMessages: Record<string, string> = {
        'greeting-name-too-short': '⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.',
        'greeting-name-too-long': '⚠️ Имя слишком длинное! Максимальная длина - 50 символов.',
        'greeting-name-invalid-chars': '⚠️ Имя содержит недопустимые символы! Используйте только буквы, пробелы и дефисы.',
        'greeting-name-multiple-words': '⚠️ Имя должно содержать только одно слово.',
        'greeting-name-inappropriate': '⚠️ Это имя содержит недопустимые выражения. Пожалуйста, введите другое имя.',
      };
      await ctx.reply(errorMessages[validation.errorKey!] || 'Ошибка валидации');
      continue; // Ask again
    }

    // Name is valid, store it
    childName = inputName;
    logger.info({ userId: ctx.from!.id, conversationId, childName }, '📝 Child name received and validated');

    // Ask for confirmation
    const keyboard = new InlineKeyboard()
      .text('✅ Да, всё верно', 'confirm_yes')
      .text('❌ Нет, ввести заново', 'confirm_no');

    await ctx.reply(`Вы указали имя: <b>${childName}</b>. Всё верно?`, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });

    // Wait for confirmation button click
    const confirmCtx = await conversation.waitFor('callback_query:data');

    // Handle button callback
    if (confirmCtx.callbackQuery.data === 'confirm_yes') {
      await confirmCtx.answerCallbackQuery();
      isConfirmed = true;
      logger.info({ userId: ctx.from!.id, conversationId, childName }, '✅ Name confirmed by user');
    }
    else if (confirmCtx.callbackQuery.data === 'confirm_no') {
      await confirmCtx.answerCallbackQuery();
      logger.info({ userId: ctx.from!.id, conversationId }, '❌ Name rejected, asking again');
      // Loop will restart and ask for name again
    }
    else {
      // Wrong callback - show message again
      await confirmCtx.answerCallbackQuery();
      logger.warn({ userId: ctx.from!.id, conversationId, data: confirmCtx.callbackQuery.data }, '⚠️ Unexpected callback data');
      await ctx.reply(`Вы указали имя: <b>${childName}</b>. Всё верно?`, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      });
    }
  }

  // Step 4.5: Ask for child's age
  let childAge: number | undefined;
  let ageConfirmed = false;

  while (!ageConfirmed) {
    await ctx.reply('🎂 Сколько лет ребенку?\n\nВведите возраст (от 1 до 18 лет):');

    const ageCtx = await conversation.waitFor('message:text');

    // Check for cancellation
    if (ageCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Диалог отменён. Введите /start для повтора.');
      logger.info({ userId: ctx.from!.id, conversationId }, '🔴 CONVERSATION CANCELLED at age step');
      return;
    }

    const ageInput = ageCtx.message?.text?.trim();
    const parsedAge = Number.parseInt(ageInput || '', 10);

    // Validate age
    if (Number.isNaN(parsedAge) || parsedAge < MIN_CHILD_AGE || parsedAge > MAX_CHILD_AGE) {
      await ctx.reply(`⚠️ Пожалуйста, введите корректный возраст от ${MIN_CHILD_AGE} до ${MAX_CHILD_AGE} лет.`);
      continue;
    }

    childAge = parsedAge;
    ageConfirmed = true;
    logger.info({ userId: ctx.from!.id, conversationId, childAge }, '🎂 Child age received and validated');
  }

  // Step 5: Handle video request with caching and deduplication
  try {
    logger.info({ userId: ctx.from!.id, conversationId, childName, childAge }, '🎬 Processing video request...');

    const result = await handleVideoRequest(BigInt(ctx.from!.id), childName, childAge);

    if (result.type === 'send_cached') {
      // Video is already available - send it immediately
      logger.info({ userId: ctx.from!.id, conversationId, childName }, '📤 Sending cached video');
      await ctx.replyWithVideo(result.fileId!);

      // Send coupons after video
      await sendCoupons(ctx.api, ctx.from!.id, config.sendCoupons);

      await ctx.reply('✅ Видео готово! Можете заказать еще одно поздравление.', {
        reply_markup: new InlineKeyboard().text('🎬 Заказать еще одно видео', 'order_another_video'),
      });
    }
    else if (result.type === 'subscribed') {
      // Video is being generated by another request - user is now subscribed
      logger.info({ userId: ctx.from!.id, conversationId, childName }, '🔔 User subscribed to existing generation task');
      await ctx.reply('⏳ Видео для этого имени уже генерируется! Мы отправим его вам, как только оно будет готово.');
    }
    else if (result.type === 'generate') {
      // New video generation needed - add to queue
      logger.info({ userId: ctx.from!.id, conversationId, assetId: result.assetId, childName }, '➕ Adding new generation task to queue');

      const queue = getVideoGenerationQueue();
      await queue.add('generate-video', {
        assetId: result.assetId!,
      });

      logger.info({ userId: ctx.from!.id, conversationId, assetId: result.assetId }, '✅ Task added to queue');
      await ctx.reply('Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲');
    }
  }
  catch (error) {
    logger.error({ userId: ctx.from!.id, conversationId, error }, '❌ Failed to process video request');
    await ctx.reply('Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже, используя команду /start');
  }

  logger.info({ userId: ctx.from!.id, conversationId }, '🔴 CONVERSATION ENDED');
}

// Register the conversation
composer.use(createConversation(greetingConversation, GREETING_CONVERSATION_NAME));

// Command handler to start the conversation
composer.command('start', async (ctx) => {
  logger.info({ userId: ctx.from?.id }, 'User started conversation with /start command');
  await ctx.conversation.enter(GREETING_CONVERSATION_NAME);
});

// Callback handler for "Order another video" button
composer.callbackQuery('order_another_video', async (ctx) => {
  await ctx.answerCallbackQuery();

  // Initialize session if undefined
  if (ctx.session === undefined) {
    ctx.session = { locale: 'ru' };
  }

  // Check if user already has an active ordering process
  if (ctx.session.orderingFlow !== undefined) {
    logger.warn({ userId: ctx.from.id }, 'User tried to order another video while order is in progress');
    await ctx.reply('⏳ Пожалуйста, дождитесь завершения текущего заказа.');
    return;
  }

  logger.info({ userId: ctx.from.id }, 'User clicked "Order another video" button - using simple flow without conversation');

  // Mark user as reordering to skip welcome message if they use /start
  ctx.session.isReordering = true;

  // Start ordering process without conversation
  ctx.session.orderingFlow = { step: 'waiting_name' };

  await ctx.reply('Замечательно! 🎁 Создадим еще одно новогоднее поздравление!\n\n✨ Введите имя ребенка, для которого создается видеопоздравление:\n\n💡 <i>Если в имени есть буква «ё», используйте именно её — так озвучка будет качественнее!</i>', {
    parse_mode: 'HTML',
  });
});

// Handle messages for users ordering without conversation
composer.on('message:text', async (ctx, next) => {
  // Initialize session if undefined
  if (ctx.session === undefined) {
    ctx.session = { locale: 'ru' };
  }

  const orderState = ctx.session.orderingFlow;

  // If user is not in ordering process, skip to next handler
  if (orderState === undefined) {
    return next();
  }

  const inputText = ctx.message.text.trim();

  // Handle cancellation
  if (inputText === '/cancel') {
    ctx.session.orderingFlow = undefined;
    ctx.session.isReordering = false;
    await ctx.reply('❌ Диалог отменён. Чтобы заказать видео, нажмите кнопку "Заказать еще одно видео".');
    return;
  }

  if (orderState.step === 'waiting_name') {
    // Validate name
    if (inputText.length < MIN_NAME_LENGTH) {
      await ctx.reply('⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.');
      return;
    }

    const validation = validateChildName(inputText);
    if (!validation.isValid) {
      const errorMessages: Record<string, string> = {
        'greeting-name-too-short': '⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.',
        'greeting-name-too-long': '⚠️ Имя слишком длинное! Максимальная длина - 50 символов.',
        'greeting-name-invalid-chars': '⚠️ Имя содержит недопустимые символы! Используйте только буквы, пробелы и дефисы.',
        'greeting-name-multiple-words': '⚠️ Имя должно содержать только одно слово.',
        'greeting-name-inappropriate': '⚠️ Это имя содержит недопустимые выражения. Пожалуйста, введите другое имя.',
      };
      await ctx.reply(errorMessages[validation.errorKey!] || 'Ошибка валидации');
      return;
    }

    // Name is valid - ask for age (NEW)
    orderState.childName = inputText;
    orderState.step = 'waiting_age';

    await ctx.reply('🎂 Сколько лет ребенку?\n\nВведите возраст (от 1 до 18 лет):');
    return;
  }

  // Add new handler for age (NEW)
  if (orderState.step === 'waiting_age') {
    const parsedAge = Number.parseInt(inputText, 10);

    if (Number.isNaN(parsedAge) || parsedAge < MIN_CHILD_AGE || parsedAge > MAX_CHILD_AGE) {
      await ctx.reply(`⚠️ Пожалуйста, введите корректный возраст от ${MIN_CHILD_AGE} до ${MAX_CHILD_AGE} лет.`);
      return;
    }

    orderState.childAge = parsedAge;
    orderState.step = 'waiting_confirm';

    const keyboard = new InlineKeyboard()
      .text('✅ Да, всё верно', 'reorder_confirm_yes')
      .text('❌ Нет, ввести заново', 'reorder_confirm_no');

    await ctx.reply(
      `Вы указали:\n<b>Имя:</b> ${orderState.childName}\n<b>Возраст:</b> ${orderState.childAge} ${getYearsWord(orderState.childAge)}\n\nВсё верно?`,
      {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      },
    );
  }
});

// Handle confirmation callbacks for reordering
composer.callbackQuery(['reorder_confirm_yes', 'reorder_confirm_no'], async (ctx) => {
  await ctx.answerCallbackQuery();

  // Initialize session if undefined
  if (ctx.session === undefined) {
    ctx.session = { locale: 'ru' };
  }

  const orderState = ctx.session.orderingFlow;

  if (orderState === undefined || orderState.childName === undefined) {
    await ctx.reply('❌ Ошибка: данные заказа не найдены. Попробуйте снова.');
    ctx.session.orderingFlow = undefined;
    ctx.session.isReordering = false;
    return;
  }

  if (ctx.callbackQuery.data === 'reorder_confirm_no') {
    // User wants to re-enter - reset to name step
    orderState.step = 'waiting_name';
    delete orderState.childName;
    delete orderState.childAge;
    await ctx.reply('Хорошо, введите имя ребенка заново:');
    return;
  }

  // User confirmed - process video request
  const childName = orderState.childName;
  const childAge = orderState.childAge;
  ctx.session.orderingFlow = undefined;
  ctx.session.isReordering = false;

  try {
    logger.info({ userId: ctx.from.id, childName, childAge }, '🎬 Processing reorder video request...');

    const result = await handleVideoRequest(BigInt(ctx.from.id), childName, childAge);

    if (result.type === 'send_cached') {
      // Video is already available - send it immediately
      logger.info({ userId: ctx.from.id, childName }, '📤 Sending cached video (reorder)');
      await ctx.replyWithVideo(result.fileId!);

      // Send coupons after video
      await sendCoupons(ctx.api, ctx.from.id, config.sendCoupons);

      await ctx.reply('✅ Видео готово! Можете заказать еще одно поздравление.', {
        reply_markup: new InlineKeyboard().text('🎬 Заказать еще одно видео', 'order_another_video'),
      });
    }
    else if (result.type === 'subscribed') {
      // Video is being generated by another request - user is now subscribed
      logger.info({ userId: ctx.from.id, childName }, '🔔 User subscribed to existing generation task (reorder)');
      await ctx.reply('⏳ Видео для этого имени уже генерируется! Мы отправим его вам, как только оно будет готово.');
    }
    else if (result.type === 'generate') {
      // New video generation needed - add to queue
      logger.info({ userId: ctx.from.id, assetId: result.assetId, childName }, '➕ Adding new generation task to queue (reorder)');

      const queue = getVideoGenerationQueue();
      await queue.add('generate-video', {
        assetId: result.assetId!,
      });

      logger.info({ userId: ctx.from.id, assetId: result.assetId }, '✅ Reorder task added to queue');
      await ctx.reply('Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲');
    }
  }
  catch (error) {
    logger.error({ userId: ctx.from.id, error }, '❌ Failed to process reorder video request');
    await ctx.reply('Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже.');
  }
});

// Handle retry button click after video generation failure
composer.callbackQuery(/^retry_video_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const assetId = ctx.match[1];

  try {
    logger.info({ userId: ctx.from.id, assetId }, 'User clicked retry button');

    // Check that asset exists and has FAILED status
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      await ctx.reply('❌ Ошибка: видео не найдено. Попробуйте создать новое.');
      return;
    }

    if (asset.status !== 'FAILED') {
      if (asset.status === 'AVAILABLE') {
        await ctx.reply('✅ Видео уже готово! Сейчас отправлю...');
        // Video is available - send it
        if (asset.telegramFileId != null) {
          await ctx.replyWithVideo(asset.telegramFileId);
          await ctx.reply('Можете заказать еще одно поздравление.', {
            reply_markup: new InlineKeyboard().text('🎬 Заказать еще одно видео', 'order_another_video'),
          });
        }
        return;
      }
      if (asset.status === 'GENERATING' || asset.status === 'PENDING') {
        await ctx.reply('⏳ Видео уже генерируется. Пожалуйста, подождите.');
        return;
      }
    }

    // Reset status to PENDING for retry
    await prisma.videoAsset.update({
      where: { id: assetId },
      data: { status: 'PENDING' },
    });

    // Reset status of all related requests
    await prisma.userRequest.updateMany({
      where: { assetId, status: 'FAILED' },
      data: { status: 'PENDING' },
    });

    // Add task to queue again
    const queue = getVideoGenerationQueue();
    await queue.add('generate-video', { assetId });

    await ctx.reply(
      '✅ Запрос отправлен повторно! Я сообщу вам, когда видео будет готово.',
      { reply_markup: { remove_keyboard: true } },
    );

    // Delete message with retry button
    try {
      await ctx.deleteMessage();
    }
    catch (deleteError) {
      // Ignore error if message is already deleted
      logger.debug({ error: deleteError }, 'Could not delete retry message');
    }
  }
  catch (error) {
    logger.error({ userId: ctx.from.id, assetId, error }, '❌ Failed to retry video generation');
    await ctx.reply('❌ Произошла ошибка при повторной отправке запроса. Попробуйте позже.');
  }
});

export { composer as greetingFeature };
