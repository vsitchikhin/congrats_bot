# Implementation Plan: Failed Job Notification & Retry

**Created:** 2025-12-26
**Architect:** Alex
**Estimated Time:** ~2h

---

## 📊 Current Situation Analysis

**✅ What Already Exists:**
- `src/bot/features/greeting.ts:566-636` - Callback handler `retry_video_<assetId>` already implemented!
- Worker processor marks asset/requests as FAILED on final attempt (lines 160-184)
- Retry handler resets status to PENDING and re-adds to queue

**❌ What's Missing:**
- Worker does NOT send notification to users when all retries fail
- Users are left without feedback or retry option

---

## 🏗️ Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                    WORKER                           │
│  (src/queue/processors/video-generation.ts)         │
│                                                     │
│  On Final Failure (isFinalAttempt === true):       │
│    1. Mark asset/requests as FAILED ✅              │
│    2. Send notification to ALL affected users ❌    │
│       - Error message (friendly)                    │
│       - Retry button: retry_video:<assetId>         │
└─────────────────────────────────────────────────────┘
                         │
                         │ User clicks button
                         ▼
┌─────────────────────────────────────────────────────┐
│                    BOT                              │
│  (src/bot/features/greeting.ts:566-636)             │
│                                                     │
│  Callback Handler: retry_video_<assetId>            │
│    1. Validate asset exists & is FAILED ✅          │
│    2. Reset status to PENDING ✅                    │
│    3. Re-add to queue ✅                            │
│    4. Send confirmation ✅                          │
└─────────────────────────────────────────────────────┘
```

**Key Decision:**
- Retry handler already exists in `greeting.ts` ✅
- We only need to add notification logic to the worker ✅

---

## 📝 Implementation Steps

### Step 1: Modify Worker Processor (video-generation.ts)

**File:** `src/queue/processors/video-generation.ts`
**Lines to modify:** 160-184 (the `isFinalAttempt` block)

**Changes:**
1. After marking asset/requests as FAILED
2. Get all affected users from `asset.userRequests`
3. For each user, send:
   - Error message (Russian, user-friendly)
   - InlineKeyboard with retry button: `retry_video:${assetId}`
4. Log notification sent for debugging

**Pseudo-code:**
```typescript
if (isFinalAttempt) {
  logger.warn({ assetId }, 'Final retry attempt failed, marking as FAILED');

  try {
    // Existing code: mark as FAILED
    await prisma.videoAsset.update(...);
    await prisma.userRequest.updateMany(...);

    // NEW: Notify all affected users
    for (const userRequest of asset.userRequests) {
      const keyboard = new InlineKeyboard()
        .text('🔄 Попробовать еще раз', `retry_video:${assetId}`);

      await botApi.sendMessage(
        Number.parseInt(userRequest.userId.toString()),
        `Упс! Что-то пошло не так при создании видео для <b>${asset.name}</b>. 😔\n\nНе переживайте, вы можете попробовать еще раз!`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );

      logger.info({ userId: userRequest.userId, assetId }, '📨 Sent failure notification with retry button');
    }
  }
  catch (updateError) {
    logger.error({ error: updateError, assetId }, 'Failed to update status or notify users');
  }
}
```

### Step 2: Verify Existing Retry Handler

**File:** `src/bot/features/greeting.ts`
**Lines:** 565-636

**Verification checklist:**
- ✅ Handler is registered: `composer.callbackQuery(/^retry_video_(.+)$/...)`
- ✅ Validates asset exists
- ✅ Checks asset status is FAILED
- ✅ Resets asset to PENDING
- ✅ Resets userRequests to PENDING
- ✅ Re-adds to queue
- ✅ Sends confirmation message
- ✅ Deletes button message after click

**No changes needed** - handler is already robust!

---

## 🔍 Edge Cases & Error Handling

### Edge Case 1: Multiple Users for Same Asset
- **Scenario:** 3 users waiting for same video, all retries fail
- **Solution:** Send notification to ALL users (loop through `asset.userRequests`)
- **Implementation:** Already planned in Step 1

### Edge Case 2: Bot API Failure When Sending Notification
- **Scenario:** Worker can't send message (user blocked bot, etc.)
- **Solution:** Wrap notification in try/catch, log error but don't re-throw
- **Implementation:** Each sendMessage should be individually wrapped

### Edge Case 3: Asset Not Found on Retry
- **Scenario:** User clicks retry but asset was deleted
- **Solution:** Retry handler already checks this (line 579-582)
- **Status:** ✅ Already handled

### Edge Case 4: User Clicks Retry Multiple Times
- **Scenario:** User spams retry button
- **Solution:** Handler checks status before re-queueing (lines 584-600)
- **Status:** ✅ Already handled

---

## 🧪 Testing Plan

### Manual Testing Checklist

1. **Trigger Job Failure:**
   - Temporarily break TTS/video service (e.g., wrong API key)
   - Create new video request
   - Wait for 3 retry attempts to fail
   - ✅ Verify error message appears with retry button

2. **Test Retry Button:**
   - Click "🔄 Попробовать еще раз" button
   - ✅ Verify confirmation message appears
   - ✅ Verify button message is deleted
   - ✅ Fix the service and verify video is generated

3. **Test Multiple Users:**
   - Create same video request from 2 different users
   - Trigger failure
   - ✅ Verify both users receive error notification

4. **Test Edge Cases:**
   - Click retry when video is already PENDING
   - Click retry when video is AVAILABLE
   - ✅ Verify appropriate messages

### Automated Testing

```bash
npm run build        # Must pass
npm run typecheck    # 0 errors
npm run lint         # Clean
```

---

## 📂 Files Modified Summary

| File | Lines | Change Type | Description |
|------|-------|-------------|-------------|
| `src/queue/processors/video-generation.ts` | 160-184 | Modify | Add user notification loop in `isFinalAttempt` block |

**New Files:** None (retry handler already exists!)

---

## ✅ Acceptance Criteria

- [ ] When job fails after 3 attempts, all affected users receive notification
- [ ] Notification message is user-friendly (Russian, no technical jargon)
- [ ] Notification includes retry button with correct callback data
- [ ] Clicking retry button triggers existing handler successfully
- [ ] Multiple users for same asset all receive notifications
- [ ] Error handling prevents worker crash if notification fails
- [ ] Build, typecheck, and lint all pass

---

## 📢 Next Steps

📢 @maya - implementation plan ready! Should take ~1h. Only need to modify worker processor.
