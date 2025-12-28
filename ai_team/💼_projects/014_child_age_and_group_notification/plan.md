# Implementation Plan: Task 014

**Status:** 🟡 SIMPLE
**Estimated Time:** ~2h
**Complexity:** Low - straightforward data collection + notification

---

## Architecture Analysis

This task involves two main changes:

1. **Age Collection Flow:**
   - Extends the existing greeting conversation in `src/bot/features/greeting.ts`
   - Adds a new conversation step after name confirmation
   - Stores age in `UserRequest` model (not in `User`, because each request can be for different children)

2. **Group Notification:**
   - Sends notification from the worker processor after successful first video generation
   - Uses Bot API to send message to a specific chat
   - Only triggers for NEW generations (first time a video is created)

**Key Architecture Decisions:**
- Age is stored per-request (UserRequest model), not per-user, because one user can order videos for multiple children of different ages
- Notification is sent from worker processor (not from greeting.ts) because:
  - We want to notify AFTER successful generation, not when queued
  - Worker already has access to user data via userRequests relation
  - Worker knows if this is a "first generation" vs "cached" scenario

---

## Implementation Steps

### Step 1: Update Database Schema

**File:** `prisma/schema.prisma`

**Changes:**
- Add `childAge Int?` field to the `UserRequest` model (nullable because existing records won't have it)
- Add after line 70 (in UserRequest model):
  ```prisma
  childAge Int? // Age of the child for this specific request (1-18 years)
  ```

**Commands to run:**
```bash
npx prisma migrate dev --name add_child_age_to_user_request
npx prisma generate
```

---

### Step 2: Add Configuration for Group Chat ID

**File:** `src/config.ts`

**Changes:**
- Add new field to `baseConfigSchema` (after line 22):
  ```typescript
  notificationGroupChatId: v.optional(v.string(), ''), // Chat ID for new order notifications
  ```

**Environment variable:**
- Add to `.env`: `NOTIFICATION_GROUP_CHAT_ID=-1002367006822` (chat ID for https://t.me/+CIzSyLXgy7Q1OGJi)
- Note: Group chat IDs in Telegram start with `-100` prefix for supergroups

---

### Step 3: Modify Greeting Conversation to Collect Age

**File:** `src/bot/features/greeting.ts`

**Changes:**

**3.1. Add age validation constants (after line 147):**
```typescript
const MIN_CHILD_AGE = 1;
const MAX_CHILD_AGE = 18;
```

**3.2. Add age collection step in conversation (after line 369, right after name confirmation):**

```typescript
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
```

**3.3. Update UserRequest creation to include childAge:**

Find all places where we create UserRequest and add `childAge` field:

- In `handleVideoRequest()` function (lines 74-80, 92-98, 121-127):
  ```typescript
  // Add parameter to function signature
  async function handleVideoRequest(
    userId: bigint,
    childName: string,
    childAge?: number, // Add this parameter
  ): Promise<VideoRequestResult>

  // Update all UserRequest.create() calls to include:
  childAge, // or childAge: childAge
  ```

- Update the call to `handleVideoRequest` on line 375:
  ```typescript
  const result = await handleVideoRequest(BigInt(ctx.from!.id), childName, childAge);
  ```

- Also update the call in reorder callback handler (line 531):
  - Need to collect age in reorder flow too
  - Add age collection step to `orderingFlow` session state
  - Update call: `handleVideoRequest(BigInt(ctx.from.id), childName, orderState.childAge)`

**Note:** For reorder flow, we also need to collect age. This requires:
1. Add `childAge?: number` to `orderingFlow` session state type (in `src/bot/context.ts`)
2. Add age collection step in the reorder message handler
3. Update confirmation to show both name and age

---

### Step 4: Implement Group Notification in Worker

**File:** `src/queue/processors/video-generation.ts`

**Changes:**

**4.1. Add notification function (at the top of the file, after imports):**

```typescript
import { config } from '#root/config.js';

/**
 * Sends a notification to the configured notification group about a new order.
 */
async function sendGroupNotification(
  botApi: Bot['api'],
  username: string | undefined,
  firstName: string,
  phoneNumber: string,
  childAge: number | undefined,
) {
  // Skip if no chat ID is configured
  if (!config.notificationGroupChatId || config.notificationGroupChatId === '') {
    logger.debug('Notification group chat ID not configured, skipping notification');
    return;
  }

  const userDisplay = username ? `@${username}` : firstName;
  const ageText = childAge !== undefined && childAge !== null
    ? `🧒 Возраст ребенка: ${childAge}`
    : '🧒 Возраст: не указан';

  const message = `Заявка от ${userDisplay}\n${ageText}\n☎️ Телефон: ${phoneNumber}`;

  try {
    await botApi.sendMessage(config.notificationGroupChatId, message);
    logger.info({ chatId: config.notificationGroupChatId }, '📢 Notification sent to group');
  } catch (error) {
    // Don't fail the job if notification fails
    logger.error({ error, chatId: config.notificationGroupChatId }, 'Failed to send group notification');
  }
}
```

**4.2. Call notification after first video sent (after line 112):**

```typescript
// 5.1. Send coupons and completion message to first user immediately after video
const keyboard = new InlineKeyboard()
  .text('🎄 Заказать еще одно видео', 'order_another_video');

await sendCoupons(botApi, Number.parseInt(firstUser.userId.toString()), config.sendCoupons);

// 5.2. Send notification to group about new order (FIRST generation only)
await sendGroupNotification(
  botApi,
  firstUser.user.username ?? undefined,
  firstUser.user.firstName,
  firstUser.user.phoneNumber ?? 'не указан',
  firstUser.childAge ?? undefined,
);

const capitalizedName = asset.name.charAt(0).toUpperCase() + asset.name.slice(1);
// ... rest of the code
```

---

### Step 5: Update Session Type for Reorder Flow

**File:** `src/bot/context.ts`

**Changes:**
- Find the `orderingFlow` session state type definition
- Add `childAge?: number` field

Example:
```typescript
orderingFlow?: {
  step: 'waiting_name' | 'waiting_age' | 'waiting_confirm';
  childName?: string;
  childAge?: number; // Add this
}
```

---

### Step 6: Extend Reorder Flow to Collect Age

**File:** `src/bot/features/greeting.ts` (reorder handlers)

**Changes:**

**6.1. Update reorder flow steps:**
- Change `step: 'waiting_name' | 'waiting_confirm'` to `step: 'waiting_name' | 'waiting_age' | 'waiting_confirm'`

**6.2. Add age collection in `composer.on('message:text')` handler (after name validation):**

```typescript
if (orderState.step === 'waiting_name') {
  // ... existing name validation ...

  // Name is valid - ask for age (NEW)
  orderState.childName = inputText;
  orderState.step = 'waiting_age'; // Change to waiting_age, not waiting_confirm

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
  return;
}
```

**6.3. Add helper function for Russian word declension (optional, for better UX):**

```typescript
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
```

**6.4. Update callback handler to handle "confirm_no" for age reset:**

```typescript
if (ctx.callbackQuery.data === 'reorder_confirm_no') {
  // User wants to re-enter - reset to name step
  orderState.step = 'waiting_name';
  delete orderState.childName;
  delete orderState.childAge; // Also clear age
  await ctx.reply('Хорошо, введите имя ребенка заново:');
  return;
}
```

**6.5. Update reorder video request call (line 531):**

```typescript
const result = await handleVideoRequest(
  BigInt(ctx.from.id),
  orderState.childName,
  orderState.childAge // Add childAge parameter
);
```

---

## Testing Checklist

After implementation, Maya should verify:

- [ ] Database migration applied successfully
- [ ] Config loads `NOTIFICATION_GROUP_CHAT_ID` from environment
- [ ] Conversation asks for age after name confirmation
- [ ] Age validation works (rejects <1, >18, non-numbers)
- [ ] Age is saved to UserRequest in database
- [ ] Reorder flow also collects age correctly
- [ ] Notification is sent to group after first video generation
- [ ] Notification format is correct (username/name, age, phone)
- [ ] Notification is NOT sent for cached videos
- [ ] Notification handles missing username gracefully
- [ ] Notification handles missing age gracefully

---

## Files Summary

**Files to modify:**
1. `prisma/schema.prisma` - Add childAge field
2. `src/config.ts` - Add notificationGroupChatId
3. `src/bot/features/greeting.ts` - Collect age, update UserRequest creation, extend reorder flow
4. `src/queue/processors/video-generation.ts` - Send notification after first video
5. `src/bot/context.ts` - Update orderingFlow type

**Files to create:**
- None (all changes are modifications to existing files)

**Migrations to run:**
- `npx prisma migrate dev --name add_child_age_to_user_request`
- `npx prisma generate`

---

## Edge Cases to Handle

1. **Missing age in existing requests:** Field is nullable, old requests won't break
2. **Missing username:** Use firstName instead
3. **Missing phone number:** Show "не указан"
4. **Notification group not configured:** Skip silently (log debug message)
5. **Notification send fails:** Log error but don't fail the video generation job
6. **User cancels during age input:** Handle `/cancel` command
7. **Reorder flow:** Must also collect age, not just initial flow

---

📢 @maya - plan is ready! Please implement the changes following this step-by-step guide. Start with database schema, then config, then conversation flow, and finally worker notification. ~2h work!
