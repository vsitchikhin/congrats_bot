# Task 011: Failed Job Notification & Retry

**Created:** 2025-12-26
**Creator:** Casey
**Complexity:** 🟡 MEDIUM (~2h)
**Status:** 🚧 In Progress

---

## 📋 Problem Description

Currently, when a video generation job fails after all retry attempts in the worker, the bot does NOT notify the user. The job is marked as FAILED in the database, but users are left waiting with no feedback.

**Current behavior (BAD):**
1. Job fails 3 times (all retries exhausted)
2. Status updated to `FAILED` in DB
3. ❌ User gets **no notification**
4. ❌ User has **no way to retry**

**Desired behavior (GOOD):**
1. Job fails 3 times (all retries exhausted)
2. Status updated to `FAILED` in DB
3. ✅ Bot sends message: "Что-то пошло не так, попробуйте еще раз"
4. ✅ Message includes button: "🔄 Попробовать еще раз"
5. ✅ On button click → create NEW job with same parameters (same child name)

---

## 🎯 Requirements

### 1. Notify User on Final Failure
- When all retry attempts are exhausted (`isFinalAttempt === true`)
- Send a message to ALL affected users (not just first one)
- Message should be friendly and non-technical
- Include an inline keyboard with retry button

### 2. Retry Button Handler
- Create callback handler for `retry_failed_video:<assetId>`
- Handler should:
  - Get the failed VideoAsset and UserRequest data
  - Create a NEW VideoAsset with same `name` (child name)
  - Create a NEW UserRequest linked to the new asset
  - Add the new asset to the queue
  - Send confirmation message to user

### 3. Error Handling
- If retry button handler fails, show user-friendly error
- Log all errors for debugging
- Don't expose technical details to users

---

## 📂 Files to Modify

### Modified Files:
1. **`src/queue/processors/video-generation.ts`** (lines 160-184)
   - Add user notification logic in the `isFinalAttempt` block
   - Send message with retry button to all affected users
   - Use callback data: `retry_failed_video:<assetId>`

### New Files:
2. **`src/bot/features/retry-video.ts`**
   - Create callback handler for `retry_failed_video` action
   - Implement retry logic (create new asset + request + queue job)
   - Register handler in bot setup

3. **`src/bot/index.ts`**
   - Import and register the new `retryVideo` feature

---

## 🔍 Implementation Details

### Notification Message (Russian):
```
Упс! Что-то пошло не так при создании видео для [имя ребенка]. 😔

Не переживайте, вы можете попробовать еще раз!
```

### Retry Button:
```typescript
const keyboard = new InlineKeyboard()
  .text('🔄 Попробовать еще раз', `retry_failed_video:${assetId}`);
```

### Retry Logic:
1. Parse `assetId` from callback data
2. Get original `VideoAsset` (with child name)
3. Check if user already has this request (avoid duplicates)
4. Create new `VideoAsset` (same name, status: PENDING)
5. Create new `UserRequest` (linked to new asset)
6. Add to queue: `videoGenerationQueue.add(...)`
7. Confirm to user: "Запрос создан! Скоро отправим видео."

---

## ✅ Acceptance Criteria

- [ ] When job fails after all retries, user receives notification
- [ ] Notification includes retry button
- [ ] Clicking retry button creates new job with same child name
- [ ] User receives confirmation after retry
- [ ] All error cases are handled gracefully
- [ ] Code follows project patterns (SOLID, DRY, KISS)
- [ ] All strings use i18n (`ctx.t(...)`)
- [ ] Tests pass: `npm run build`, `npm run typecheck`, `npm run lint`

---

## 📢 Signals

**Next Steps:**
- 📢 @alex - need architecture plan for retry mechanism!
