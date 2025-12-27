# Plan 012: Улучшение валидации имени ребенка

**Task Status:** 🟡 SIMPLE
**Estimated Time:** ~1.5h

---

## 📋 Implementation Plan

### Step 1: Install profanity filter library
**Action:** Add `leo-profanity` npm package

```bash
npm install leo-profanity
```

**Why leo-profanity:**
- Popular library with 200k+ weekly downloads
- Built-in Russian language support
- Simple API: `check()` and `clean()` methods
- TypeScript support

**Files affected:**
- `package.json` (auto-updated by npm)

---

### Step 2: Create profanity filter service
**Action:** Create new service file `src/services/profanity-filter.ts`

**Implementation:**
```typescript
import filter from 'leo-profanity';

// Load Russian dictionary
filter.loadDictionary('ru');

/**
 * Check if text contains profanity
 * @param text Text to check
 * @returns true if profanity detected, false otherwise
 */
export function containsProfanity(text: string): boolean {
  return filter.check(text);
}

/**
 * Clean profanity from text (for logging purposes)
 * @param text Text to clean
 * @returns Cleaned text with profanity replaced by asterisks
 */
export function cleanProfanity(text: string): string {
  return filter.clean(text);
}

export const profanityFilter = {
  check: containsProfanity,
  clean: cleanProfanity,
};
```

**Files created:**
- `src/services/profanity-filter.ts` (new file)

---

### Step 3: Update validation function in greeting feature
**Action:** Modify `validateChildName()` in `src/bot/features/greeting.ts:154-170`

**Changes:**
1. Import the profanity filter service
2. Add check for single word (split by space)
3. Add profanity check using the service

**Updated function:**
```typescript
import { profanityFilter } from '#root/services/profanity-filter.js';

// ... existing code ...

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

  // 3. Single word validation (NEW)
  const words = trimmedName.split(/\s+/).filter(word => word.length > 0);
  if (words.length > 1) {
    return { isValid: false, errorKey: 'greeting-name-multiple-words' };
  }

  // 4. Profanity check (NEW)
  if (profanityFilter.check(trimmedName)) {
    return { isValid: false, errorKey: 'greeting-name-inappropriate' };
  }

  return { isValid: true };
}
```

**Files affected:**
- `src/bot/features/greeting.ts:154-170` - update validation function
- `src/bot/features/greeting.ts:1` - add import for profanity filter

---

### Step 4: Add error message mappings
**Action:** Update error message mapping in two places in `greeting.ts`

**Location 1:** Line ~307-312 (conversation flow)
**Location 2:** Line ~460-466 (reorder flow)

**Add to error messages object:**
```typescript
const errorMessages: Record<string, string> = {
  'greeting-name-too-short': '⚠️ Имя слишком короткое! Пожалуйста, введите имя длиной не менее 2 символов.',
  'greeting-name-too-long': '⚠️ Имя слишком длинное! Максимальная длина - 50 символов.',
  'greeting-name-invalid-chars': '⚠️ Имя содержит недопустимые символы! Используйте только буквы, пробелы и дефисы.',
  'greeting-name-multiple-words': '⚠️ Пожалуйста, введите только одно имя (без пробелов).',  // NEW
  'greeting-name-inappropriate': '⚠️ Это имя содержит недопустимые выражения. Пожалуйста, введите другое имя.',  // NEW
};
```

**Files affected:**
- `src/bot/features/greeting.ts:307-312` - add new error messages
- `src/bot/features/greeting.ts:460-466` - add new error messages (duplicate location)

---

### Step 5: Add localization strings (optional, for future i18n)
**Action:** Add new error keys to `locales/ru.ftl`

**Add after line 23:**
```ftl
greeting-name-multiple-words = ⚠️ Пожалуйста, введите только одно имя (без пробелов).
greeting-name-inappropriate = ⚠️ Это имя содержит недопустимые выражения. Пожалуйста, введите другое имя.
```

**Note:** Currently errors are hardcoded in `greeting.ts`, but adding to locales prepares for future migration to i18n.

**Files affected:**
- `locales/ru.ftl:24-25` (add new lines after existing validation messages)

---

### Step 6: Add tests for profanity filter service
**Action:** Create test file `tests/services/profanity-filter.test.ts`

**Test cases:**
- Should detect Russian profanity
- Should detect common inappropriate words
- Should allow normal names
- Should handle empty strings
- Should handle mixed case

**Files created:**
- `tests/services/profanity-filter.test.ts` (new file, optional)

---

## ✅ Verification Steps

After implementation, verify:

1. **Install check:**
   ```bash
   npm list leo-profanity
   ```

2. **Build check:**
   ```bash
   npm run build
   npm run typecheck
   ```

3. **Manual testing:**
   - Start bot and test with multi-word name: "Маша Петя" → should show error
   - Test with profanity (use test words) → should show error
   - Test with normal single name: "Маша" → should pass

4. **Log verification:**
   - Check that inappropriate names are logged (cleaned) without exposing actual profanity

---

## 📁 Files Summary

**Modified:**
- `src/bot/features/greeting.ts` - update validation function and error messages
- `locales/ru.ftl` - add new error strings
- `package.json` - add leo-profanity dependency

**Created:**
- `src/services/profanity-filter.ts` - new profanity filter service
- `tests/services/profanity-filter.test.ts` - tests (optional)

---

## 🎯 Acceptance Criteria Checklist

- [ ] `leo-profanity` library installed successfully
- [ ] Service `profanity-filter.ts` created with `check()` method
- [ ] `validateChildName()` function updated with:
  - [ ] Single word check (no spaces allowed)
  - [ ] Profanity check using service
- [ ] Error messages added for both conversation and reorder flows
- [ ] Localization strings added to `ru.ftl`
- [ ] Manual testing passed:
  - [ ] Multi-word names rejected
  - [ ] Inappropriate content rejected
  - [ ] Valid single names accepted
- [ ] Build and typecheck pass with no errors

---

## 📢 Next Steps

📢 @maya - implementation plan ready! Please proceed with coding. Estimated time: ~1.5h
