import type { BaseContext, Context } from '#root/bot/context.js';
import type { Conversation } from '@grammyjs/conversations';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { getVideoGenerationQueue } from '#root/queue/definitions/video-generation.js';
import { createConversation } from '@grammyjs/conversations';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';

const composer = new Composer<Context>();

const GREETING_CONVERSATION_NAME = 'greeting';

// Track users who are ordering without conversation (for repeat orders)
const orderingWithoutConversation = new Map<number, { step: 'waiting_name' | 'waiting_confirm'; childName?: string }>();

// Track users who are currently in conversation to prevent starting a new one
const activeConversations = new Set<number>();

// Track users who clicked "Order another video" button to skip welcome message
const reorderingUsers = new Set<number>();

// Validation constants
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
// Using unicode ranges for Cyrillic letters to avoid obscure character range warnings
const VALID_NAME_REGEX = /^[\u0400-\u04FFa-zA-Z\s-]+$/;

// Validation helper
interface ValidationResult {
  isValid: boolean;
  errorKey?: string;
}

export function validateChildName(name: string): ValidationResult {
  const trimmedName = name.trim();

  if (trimmedName.length < MIN_NAME_LENGTH) {
    return { isValid: false, errorKey: 'greeting-name-too-short' };
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    return { isValid: false, errorKey: 'greeting-name-too-long' };
  }

  if (!VALID_NAME_REGEX.test(trimmedName)) {
    return { isValid: false, errorKey: 'greeting-name-invalid-chars' };
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

  // Mark conversation as active
  activeConversations.add(ctx.from!.id);

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
      const isReordering = reorderingUsers.has(ctx.from!.id);
      if (!isReordering) {
        await ctx.reply('С возвращением! 👋');
      }
      // Clear the reordering flag
      reorderingUsers.delete(ctx.from!.id);
    }
  }
  catch (error) {
    logger.error({ error, userId: ctx.from!.id }, 'Failed to check user in database');
  }

  // Step 2: If no phone number exists, ask for it
  if (!phoneNumber) {
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
    await ctx.reply('Пожалуйста, введите имя ребенка:');

    // Wait for user's response (only accept text messages, ignore audio/video from worker)
    const nameCtx = await conversation.waitFor('message:text');

    // Check for cancellation
    if (nameCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Диалог отменён. Введите /start для повтора.');
      logger.info({ userId: ctx.from!.id, conversationId }, '🔴 CONVERSATION CANCELLED');
      activeConversations.delete(ctx.from!.id);
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

  // Step 5: Create video job and add to queue
  try {
    logger.info({ userId: ctx.from!.id, conversationId, childName }, '🎬 Creating video job...');

    // Create VideoJob in database
    const videoJob = await prisma.videoJob.create({
      data: {
        userId: BigInt(ctx.from!.id),
        childName,
        phoneNumber,
        status: 'PENDING',
      },
    });

    logger.info({ userId: ctx.from!.id, conversationId, jobId: videoJob.id, childName }, '✅ Video job created in DB');

    // Add job to BullMQ queue
    const queue = getVideoGenerationQueue();
    await queue.add('generate-video', {
      jobId: videoJob.id,
    });

    logger.info({ userId: ctx.from!.id, conversationId, jobId: videoJob.id }, '✅ Job added to queue');

    // Show success message (button will appear after video is ready)
    await ctx.reply('⏳ Отлично! Ваш заказ принят в обработку. Видео будет готово в ближайшее время!');
  }
  catch (error) {
    logger.error({ userId: ctx.from!.id, conversationId, error }, '❌ Failed to create video job or add to queue');
    await ctx.reply('Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже, используя команду /start');
  }

  logger.info({ userId: ctx.from!.id, conversationId }, '🔴 CONVERSATION ENDED');

  // Mark conversation as no longer active
  activeConversations.delete(ctx.from!.id);
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

  // Check if user already has an active conversation or ordering process
  if (activeConversations.has(ctx.from.id) || orderingWithoutConversation.has(ctx.from.id)) {
    logger.warn({ userId: ctx.from.id }, 'User tried to order another video while order is in progress');
    await ctx.reply('⏳ Пожалуйста, дождитесь завершения текущего заказа.');
    return;
  }

  logger.info({ userId: ctx.from.id }, 'User clicked "Order another video" button - using simple flow without conversation');

  // Mark user as reordering to skip welcome message if they use /start
  reorderingUsers.add(ctx.from.id);

  // Start ordering process without conversation
  orderingWithoutConversation.set(ctx.from.id, { step: 'waiting_name' });

  await ctx.reply('Отлично! Давайте создадим еще одно поздравление.\n\nПожалуйста, введите имя ребенка:');
});

// Handle messages for users ordering without conversation
composer.on('message:text', async (ctx, next) => {
  const orderState = orderingWithoutConversation.get(ctx.from.id);

  // If user is not in ordering process, skip to next handler
  if (!orderState) {
    return next();
  }

  const inputText = ctx.message.text.trim();

  // Handle cancellation
  if (inputText === '/cancel') {
    orderingWithoutConversation.delete(ctx.from.id);
    reorderingUsers.delete(ctx.from.id);
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
      };
      await ctx.reply(errorMessages[validation.errorKey!] || 'Ошибка валидации');
      return;
    }

    // Name is valid - ask for confirmation
    orderState.childName = inputText;
    orderState.step = 'waiting_confirm';

    const keyboard = new InlineKeyboard()
      .text('✅ Да, всё верно', 'reorder_confirm_yes')
      .text('❌ Нет, ввести заново', 'reorder_confirm_no');

    await ctx.reply(`Вы указали имя: <b>${inputText}</b>. Всё верно?`, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  }
});

// Handle confirmation callbacks for reordering
composer.callbackQuery(['reorder_confirm_yes', 'reorder_confirm_no'], async (ctx) => {
  await ctx.answerCallbackQuery();

  const orderState = orderingWithoutConversation.get(ctx.from.id);

  if (!orderState || orderState.childName === undefined) {
    await ctx.reply('❌ Ошибка: данные заказа не найдены. Попробуйте снова.');
    orderingWithoutConversation.delete(ctx.from.id);
    reorderingUsers.delete(ctx.from.id);
    return;
  }

  if (ctx.callbackQuery.data === 'reorder_confirm_no') {
    // User wants to re-enter name
    orderState.step = 'waiting_name';
    delete orderState.childName;
    await ctx.reply('Хорошо, введите имя ребенка заново:');
    return;
  }

  // User confirmed - create video job
  const childName = orderState.childName;
  orderingWithoutConversation.delete(ctx.from.id);
  reorderingUsers.delete(ctx.from.id);

  try {
    // Get user's phone number from database
    const user = await prisma.user.findUnique({
      where: { id: BigInt(ctx.from.id) },
      select: { phoneNumber: true },
    });

    if (!user || user.phoneNumber === null) {
      await ctx.reply('❌ Ошибка: номер телефона не найден. Пожалуйста, используйте /start');
      return;
    }

    // Create VideoJob in database
    const videoJob = await prisma.videoJob.create({
      data: {
        userId: BigInt(ctx.from.id),
        childName,
        phoneNumber: user.phoneNumber,
        status: 'PENDING',
      },
    });

    logger.info({ userId: ctx.from.id, jobId: videoJob.id, childName }, '✅ Reorder video job created in DB');

    // Add job to BullMQ queue
    const queue = getVideoGenerationQueue();
    await queue.add('generate-video', {
      jobId: videoJob.id,
    });

    logger.info({ userId: ctx.from.id, jobId: videoJob.id }, '✅ Reorder job added to queue');

    await ctx.reply('⏳ Отлично! Ваш заказ принят в обработку. Видео будет готово в ближайшее время!');
  }
  catch (error) {
    logger.error({ userId: ctx.from.id, error }, '❌ Failed to create reorder video job');
    await ctx.reply('Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже.');
  }
});

export { composer as greetingFeature };
