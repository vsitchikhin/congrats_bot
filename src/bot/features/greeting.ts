import type { BaseContext, Context } from '#root/bot/context.js';
import type { Conversation } from '@grammyjs/conversations';
import { prisma } from '#root/db/client.js';
import { logger } from '#root/logger.js';
import { getGreetingQueue } from '#root/queue/definitions/greeting.js';
import { createConversation } from '@grammyjs/conversations';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';

const composer = new Composer<Context>();

const GREETING_CONVERSATION_NAME = 'greeting';

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
  // Step 1: Ask for phone number first
  let phoneNumber = '';
  let phoneReceived = false;

  while (!phoneReceived) {
    // Create keyboard with "Share phone number" button
    const phoneKeyboard = new Keyboard()
      .requestContact('📱 Поделиться номером телефона')
      .resized();

    await ctx.reply('Добро пожаловать в бота "Новогоднее поздравление"! 🎄\n\nПожалуйста, поделитесь своим номером телефона, нажав на кнопку ниже:', {
      reply_markup: phoneKeyboard,
    });

    // Wait for user's response
    const phoneCtx = await conversation.wait();

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

  // Step 2: Save/update user in database
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

  // Step 3: Ask for child's name
  let childName = '';
  let isConfirmed = false;

  while (!isConfirmed) {
    // Ask for child's name
    await ctx.reply('Пожалуйста, введите имя ребенка:');

    // Wait for user's response
    const nameCtx = await conversation.wait();

    // Check for cancellation
    if (nameCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Диалог отменён. Введите /start для повтора.');
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

    // Ask for confirmation
    const keyboard = new InlineKeyboard()
      .text('✅ Да, всё верно', 'confirm_yes')
      .text('❌ Нет, ввести заново', 'confirm_no');

    await ctx.reply(`Вы указали имя: <b>${childName}</b>. Всё верно?`, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });

    // Wait for confirmation button click
    const confirmCtx = await conversation.wait();

    // Check for cancellation
    if (confirmCtx.message?.text === '/cancel') {
      await ctx.reply('❌ Диалог отменён. Введите /start для повтора.');
      return;
    }

    // Handle button callback
    if (confirmCtx.callbackQuery?.data === 'confirm_yes') {
      await confirmCtx.answerCallbackQuery();
      isConfirmed = true;
    }
    else if (confirmCtx.callbackQuery?.data === 'confirm_no') {
      await confirmCtx.answerCallbackQuery();
      // Loop will restart and ask for name again
    }
    else {
      // User sent a message instead of clicking button, ignore and wait again
      await ctx.reply(`Вы указали имя: <b>${childName}</b>. Всё верно?`, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      });
      continue;
    }
  }

  // Step 4: Create video job and add to queue
  try {
    // Create VideoJob in database
    const videoJob = await prisma.videoJob.create({
      data: {
        userId: BigInt(ctx.from!.id),
        childName,
        phoneNumber,
        status: 'PENDING',
      },
    });

    try {
      // Add job to BullMQ queue
      const queue = getGreetingQueue();
      await queue.add('generate-video', {
        jobId: videoJob.id,
      });

      await ctx.reply('⏳ Отлично! Ваш заказ принят в обработку...');
    }
    catch (queueError) {
      // If queue fails, mark job as FAILED
      logger.error({ error: queueError, jobId: videoJob.id }, 'Failed to add job to queue');
      await prisma.videoJob.update({
        where: { id: videoJob.id },
        data: { status: 'FAILED' },
      });
      throw queueError; // Re-throw to outer catch
    }
  }
  catch (error) {
    logger.error({ error }, 'Failed to create video job');
    await ctx.reply('Произошла ошибка при создании заказа. Пожалуйста, попробуйте позже, используя команду /start');
  }
}

// Register the conversation
composer.use(createConversation(greetingConversation, GREETING_CONVERSATION_NAME));

// Command handler to start the conversation
composer.command('start', async (ctx) => {
  await ctx.conversation.enter(GREETING_CONVERSATION_NAME);
});

export { composer as greetingFeature };
