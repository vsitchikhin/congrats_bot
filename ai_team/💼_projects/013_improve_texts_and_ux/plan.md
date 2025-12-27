# Plan 013: Улучшение текстов и UX-сообщений

**Task Status:** 🟢 TRIVIAL
**Estimated Time:** ~0.5h

---

## 📋 Implementation Plan

This is primarily a text editing task with minimal code changes.

---

### Step 1: Remove caption from video messages
**Action:** Remove `caption` parameter when sending video in processor

**Location:** `src/queue/processors/video-generation.ts`

**Change 1 (Line ~82-90):** Remove caption from first user's video
```typescript
// BEFORE:
const message = await botApi.sendVideo(
  Number.parseInt(firstUser.userId.toString()),
  new InputFile(videoPath),
  {
    caption: 'Вот ваше персональное новогоднее поздравление! 🎉',  // ❌ REMOVE THIS
    width: 1920,
    height: 1080,
  },
);

// AFTER:
const message = await botApi.sendVideo(
  Number.parseInt(firstUser.userId.toString()),
  new InputFile(videoPath),
  {
    width: 1920,
    height: 1080,
  },
);
```

**Change 2 (Line ~125-133):** Remove caption from cached video sends
```typescript
// BEFORE:
await botApi.sendVideo(
  Number.parseInt(userRequest.userId.toString()),
  fileId,
  {
    caption: 'Вот ваше персональное новогоднее поздравление! 🎉',  // ❌ REMOVE THIS
    width: 1920,
    height: 1080,
  },
);

// AFTER:
await botApi.sendVideo(
  Number.parseInt(userRequest.userId.toString()),
  fileId,
  {
    width: 1920,
    height: 1080,
  },
);
```

**Files affected:**
- `src/queue/processors/video-generation.ts:86` - remove caption
- `src/queue/processors/video-generation.ts:129` - remove caption

---

### Step 2: Update completion message with capitalized and bold name
**Action:** Capitalize name and make it bold in message after coupons

**Location:** `src/queue/processors/video-generation.ts`

**Change 1 (Line ~105-109):** Update message for first user
```typescript
// BEFORE:
await botApi.sendMessage(
  Number.parseInt(firstUser.userId.toString()),
  `Ваше видеопоздравление для ${asset.name} готово! 🎊`,
  { reply_markup: keyboard },
);

// AFTER:
const capitalizedName = asset.name.charAt(0).toUpperCase() + asset.name.slice(1);
await botApi.sendMessage(
  Number.parseInt(firstUser.userId.toString()),
  `<b>${capitalizedName}</b>, ваша новогодняя открытка готова! 🎁`,
  {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  },
);
```

**Change 2 (Line ~138-142):** Update message for remaining users
```typescript
// BEFORE:
await botApi.sendMessage(
  Number.parseInt(userRequest.userId.toString()),
  `Ваше видеопоздравление для ${asset.name} готово! 🎊`,
  { reply_markup: keyboard },
);

// AFTER:
const capitalizedName = asset.name.charAt(0).toUpperCase() + asset.name.slice(1);
await botApi.sendMessage(
  Number.parseInt(userRequest.userId.toString()),
  `<b>${capitalizedName}</b>, ваша новогодняя открытка готова! 🎁`,
  {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  },
);
```

**Note:** Calculate `capitalizedName` once before the loop to avoid duplication.

**Files affected:**
- `src/queue/processors/video-generation.ts:105-109` - update message with capitalized bold name
- `src/queue/processors/video-generation.ts:138-142` - update message with capitalized bold name

---

### Step 3: Update "processing" text in greeting feature
**Action:** Replace hardcoded text in greeting conversation

**Location:** `src/bot/features/greeting.ts:388`

```typescript
// BEFORE:
await ctx.reply('⏳ Отлично! Ваш заказ принят в обработку. Видео будет готово в ближайшее время!');

// AFTER:
await ctx.reply('Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲');
```

**Location 2:** `src/bot/features/greeting.ts:542` (reorder flow)

```typescript
// BEFORE:
await ctx.reply('⏳ Отлично! Ваш заказ принят в обработку. Видео будет готово в ближайшее время!');

// AFTER:
await ctx.reply('Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲');
```

**Files affected:**
- `src/bot/features/greeting.ts:388` - update processing message
- `src/bot/features/greeting.ts:542` - update processing message (reorder)

---

### Step 4: Update all texts in locales to be more festive
**Action:** Update `locales/ru.ftl` with New Year theme and emojis

**Changes:**

```ftl
## Greeting Conversation

greeting-ask-name = ✨ Введите имя ребенка, для которого создается видеопоздравление:

greeting-confirm = Вы указали имя: <b>{ $name }</b>. Всё верно? ✨

greeting-confirm-yes = ✅ Да, всё верно
greeting-confirm-no = ❌ Нет, ввести заново

greeting-name-too-short = ⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.
greeting-name-too-long = ⚠️ Имя слишком длинное! Максимальная длина - 50 символов.
greeting-name-invalid-chars = ⚠️ Имя содержит недопустимые символы! Используйте только буквы, пробелы и дефисы.

greeting-ask-phone = 🎄 Добро пожаловать в бота "Новогоднее поздравление"!

Поделитесь своим номером телефона, чтобы получить персональное видеопоздравление! 🎁

greeting-share-phone = 📱 Поделиться номером телефона

greeting-phone-invalid = ⚠️ Некорректный номер телефона. Пожалуйста, используйте кнопку "Поделиться номером телефона".

greeting-phone-received = ✅ Спасибо! Номер телефона получен.

greeting-cancelled = ❌ Диалог отменён. Введите /start для повтора.

greeting-processing = Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲
```

**Additional improvements for other messages (optional):**

```ftl
## Welcome Feature

welcome = 🎄 Добро пожаловать!
greeting-welcome = 🎅 Добро пожаловать в бота "Новогоднее поздравление"! ✨

## Error Messages

error-video-generation-failed = ❌ К сожалению, не удалось создать видео из-за проблем на стороннем сервере. 😔

Вы можете попробовать еще раз, нажав на кнопку ниже:

error-retry-button = 🔄 Попробовать еще раз
error-video-not-found = ❌ Видео не найдено. Попробуйте создать новое.
error-video-already-ready = ✅ Видео уже готово! Сейчас отправлю... 🎁
error-video-already-generating = ⏳ Видео уже генерируется. Немного терпения! ⭐
error-retry-success = ✅ Запрос отправлен повторно! Я сообщу вам, когда видео будет готово. 🎄
error-retry-failed = ❌ Произошла ошибка при повторной отправке запроса. Попробуйте позже.
```

**Files affected:**
- `locales/ru.ftl:15-31` - update greeting conversation texts
- `locales/ru.ftl:10-13` - update welcome texts (optional)
- `locales/ru.ftl:48-57` - update error messages (optional)

---

### Step 5: Update hardcoded texts in greeting.ts (optional improvements)
**Action:** Make other hardcoded texts more festive

**Location 1:** `src/bot/features/greeting.ts:196` (welcome back message)
```typescript
// BEFORE:
await ctx.reply('С возвращением! 👋');

// AFTER:
await ctx.reply('С возвращением! Рады видеть вас снова! 🎄');
```

**Location 2:** `src/bot/features/greeting.ts:280-282` (ask name message)
```typescript
// BEFORE:
await ctx.reply('Пожалуйста, введите имя ребенка:\n\n💡 <i>Если в имени есть буква «ё», используйте именно её — так озвучка будет качественнее!</i>', {
  parse_mode: 'HTML',
});

// AFTER:
await ctx.reply('✨ Введите имя ребенка, для которого создается видеопоздравление:\n\n💡 <i>Если в имени есть буква «ё», используйте именно её — так озвучка будет качественнее!</i>', {
  parse_mode: 'HTML',
});
```

**Location 3:** `src/bot/features/greeting.ts:427-429` (reorder flow)
```typescript
// BEFORE:
await ctx.reply('Отлично! Давайте создадим еще одно поздравление.\n\nПожалуйста, введите имя ребенка:...

// AFTER:
await ctx.reply('Замечательно! 🎁 Создадим еще одно новогоднее поздравление!\n\n✨ Введите имя ребенка:...
```

**Files affected:**
- `src/bot/features/greeting.ts:196, 280-282, 427-429` - update hardcoded messages (optional)

---

## ✅ Verification Steps

After implementation, verify:

1. **Build check:**
   ```bash
   npm run build
   npm run typecheck
   ```

2. **Manual testing:**
   - Order new video → verify "processing" message changed
   - Wait for video → verify NO caption on video itself
   - Check message after coupons → verify name is **bold** and capitalized
   - Read all texts → verify they feel festive and New Year-themed 🎄

3. **Visual check:**
   - All emojis render correctly
   - Messages don't feel cluttered
   - Tone is warm and friendly

---

## 📁 Files Summary

**Modified:**
- `src/queue/processors/video-generation.ts` - remove captions, update completion message
- `src/bot/features/greeting.ts` - update "processing" text (2 locations)
- `locales/ru.ftl` - make all texts more festive

**Created:**
- None

---

## 🎯 Acceptance Criteria Checklist

- [ ] Video is sent WITHOUT caption (no text duplication)
- [ ] Name in completion message is:
  - [ ] Capitalized (first letter uppercase)
  - [ ] Bold (using HTML `<b>` tag)
  - [ ] Message updated: "**Маша**, ваша новогодняя открытка готова! 🎁"
- [ ] "Processing" text replaced with: "Ваше видеопоздравление готовится. Открытка будет готова в ближайшее время! 🌲"
- [ ] All texts in `locales/ru.ftl` updated with New Year emojis 🎄⭐🎁❄️✨
- [ ] Manual testing completed - everything looks festive!
- [ ] Build and typecheck pass

---

## 📢 Next Steps

📢 @maya - simple text update task ready! This should be quick (~30min). Proceed with implementation.
