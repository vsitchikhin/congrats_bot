# План реализации Задачи 008: Обновить меню бота

## Описание задачи
Упростить и стандартизировать меню бота. Удалить функционал смены языка и унифицировать логику повторного заказа видео.

## План действий

### 1. Удаление функции смены языка

- **Цель:** Полностью исключить возможность смены языка, оставив только русский (`ru`).

- **Действия:**
    1.  Удалить файл `src/bot/features/language.ts`.
    2.  Удалить файл `src/bot/keyboards/change-language.ts`.
    3.  Удалить файл `src/bot/callback-data/change-language.ts`.
    4.  В `src/bot/index.ts` убрать импорт и регистрацию `languageFeature`.
    5.  В `src/bot/helpers/set-commands.ts` удалить команду `/language` из списка команд.
    6.  В `src/bot/i18n.ts` упростить логику:
        - Убрать `fluent.useLocale(ctx.session.languageCode);`.
        - Инициализировать `Fluent` только с русской локалью.
        - Удалить зависимость от сессии для определения языка.

### 2. Упрощение логики повторного заказа видео

- **Цель:** Устранить дублирующую и сложную логику для повторных заказов. Кнопка "Заказать новое видео" должна просто перезапускать основной, уже существующий диалог.

- **Действия в `src/bot/features/greeting.ts`:**
    1.  **Удалить избыточный код:**
        - Полностью удалить `orderingWithoutConversation` (переменная `Map`).
        - Полностью удалить `reorderingUsers` (переменная `Set`).
        - Удалить обработчик `composer.on('message:text', ...)` который обрабатывал текстовые сообщения для "простого" потока.
        - Удалить обработчик `composer.callbackQuery(['reorder_confirm_yes', 'reorder_confirm_no'], ...)` который обрабатывал подтверждение для "простого" потока.
    2.  **Изменить обработчик `order_another_video`:**
        - Заменить текущую сложную логику на простой перезапуск основного диалога:
          ```typescript
          composer.callbackQuery('order_another_video', async (ctx) => {
            await ctx.answerCallbackQuery();
            // Проверка, чтобы не запускать новый диалог поверх активного
            if (activeConversations.has(ctx.from.id)) {
              await ctx.reply('Вы уже в процессе создания видео. Пожалуйста, завершите или отмените текущий заказ.');
              return;
            }
            // Просто входим в основной диалог
            await ctx.conversation.enter('greeting');
          });
          ```
    3.  **Очистить `greetingConversation`:**
        - Внутри основной функции `greetingConversation` найти и удалить все проверки, связанные с `reorderingUsers` (например, `const isReordering = reorderingUsers.has(ctx.from.id);`).

## Файлы для изменения
- `src/bot/features/language.ts` (удалить)
- `src/bot/keyboards/change-language.ts` (удалить)
- `src/bot/callback-data/change-language.ts` (удалить)
- `src/bot/index.ts`
- `src/bot/helpers/set-commands.ts`
- `src/bot/i18n.ts`
- `src/bot/features/greeting.ts`

## Критерии приемки
- ✅ Команда `/language` удалена и не работает.
- ✅ Кнопка смены языка больше не появляется.
- ✅ Бот всегда отвечает на русском языке.
- ✅ Кнопка "Заказать новое видео" успешно запускает основной диалог с запросом имени ребенка.
- ✅ Код в `src/bot/features/greeting.ts` значительно упрощен.
