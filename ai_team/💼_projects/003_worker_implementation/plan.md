# План реализации Задачи 3.1: Реализация фонового обработчика (Worker)

## Описание задачи
Создать основной цикл воркера в `src/worker.ts`. Он должен подключаться к Redis, забирать задачи из очереди `greeting` (BullMQ), обрабатывать их и управлять их жизненным циклом (завершение, ошибка). Воркер должен быть независимым, отказоустойчивым процессом.

## Текущее состояние
- ✅ Очередь `greetingQueue` уже создана в `src/queue/definitions/greeting.ts`.
- ✅ Процессор `greetingProcessor` уже существует в `src/queue/processors/greeting.ts` и содержит базовую логику.
- ✅ Конфигурация для Redis должна быть доступна через `src/config.ts`.

## План действий

### 1. Настройка BullMQ Worker
- Инициализировать `Worker` из `bullmq` в `src/worker.ts`.
- Указать имя очереди (`greetingQueue.name`) и функцию-обработчик (`createGreetingProcessor`) при создании воркера.
- Подключить к Redis, используя настройки из `src/config.ts`.

### 2. Обработка задач
- Убедиться, что `createGreetingProcessor` правильно принимает `job` (из BullMQ) и извлекает из него `jobId`.
- Внутри `createGreetingProcessor` должна быть реализована логика:
    - Обновление статуса `VideoJob` в БД на `PROCESSING` в начале обработки.
    - Вызов сервисов для генерации аудио (Задача 4.1) и монтажа видео (Задача 4.2).
    - Обновление статуса `VideoJob` в БД на `COMPLETED` в случае успеха или `FAILED` в случае ошибки.
    - Отправка видео пользователю (Задача 5.1).

### 3. Обработка ошибок и жизненный цикл задач
- Реализовать обработку ошибок внутри `createGreetingProcessor` и для самого `Worker` (используя `worker.on('failed', ...)`, `worker.on('error', ...)`).
- В случае ошибки обработки задачи, статус `VideoJob` в БД должен быть изменен на `FAILED`, и соответствующее уведомление (например, в лог) должно быть отправлено.
- Убедиться, что задачи, завершившиеся ошибкой, не блокируют очередь.

### 4. Graceful Shutdown
- Реализовать механизм "graceful shutdown" для воркера, чтобы он мог корректно завершить текущие задачи и закрыть соединения с Redis при получении сигнала завершения процесса (например, `SIGTERM`).

### 5. Логирование
- Интегрировать `logger` из `src/logger.ts` для всех важных событий воркера: запуск, получение задачи, начало/конец обработки, ошибки.

### 6. Докеризация воркера
- Добавить новый сервис `worker` в `docker-compose.yml`.
- Настроить `Dockerfile` для создания образа воркера, который будет запускать `src/worker.ts`.
- Убедиться, что переменные окружения, необходимые для воркера (например, для Redis), правильно передаются.

## Пример кода (добавлено в `src/worker.ts`)

```typescript
// src/worker.ts
import { Worker } from 'bullmq';
import { createGreetingProcessor } from '#root/queue/processors/greeting.js';
import { greetingQueue } from '#root/queue/definitions/greeting.js';
import { config } from '#root/config.js';
import { logger } from '#root/logger.js';
import { Bot } from 'grammy'; // Assuming worker will send messages

// Initialize bot for sending messages from worker
const bot = new Bot(config.BOT_TOKEN);

const worker = new Worker(
  greetingQueue.name,
  createGreetingProcessor(bot.api), // Pass bot instance to processor
  {
    connection: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
    },
    concurrency: 5, // Process up to 5 jobs at once
  },
);

worker.on('active', (job) => {
  logger.info(`Job ${job.id} started processing`);
});

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed with error: ${err.message}`);
  // TODO: Update VideoJob status in DB to FAILED
});

process.on('SIGINT', () => worker.close());
process.on('SIGTERM', () => worker.close());

logger.info(`Worker for queue ${greetingQueue.name} started`);

// In createGreetingProcessor in src/queue/processors/greeting.ts, it will need to accept botApi as a parameter
// Example:
// export const createGreetingProcessor = (botApi: Bot['api']) => async (job: Job) => { ... }
```

## Зависимости
- `bullmq` (уже установлен)
- `#root/queue/definitions/greeting.js` (уже существует)
- `#root/queue/processors/greeting.js` (уже существует, потребуется модификация)
- `#root/config.js` (уже существует)
- `#root/logger.js` (уже существует)
- `grammy` (для отправки сообщений из воркера, уже установлен)

## Потенциальные риски
- **Неправильная обработка "зависших" (stalled) задач в BullMQ**: Необходимо правильно настроить опции `stalledInterval` и `maxStalledCount` для `Worker`.
- **Высокое потребление памяти при обработке "тяжелых" задач**: Ограничить `concurrency` воркера, оптимизировать сервисы генерации аудио/видео.
- **Отсутствие механизма graceful shutdown**: Может приводить к потере данных или повторной обработке задач при перезапуске воркера.
- **Сбой Redis**: Воркер не сможет забирать задачи. Необходимо настроить мониторинг Redis.
- **Ошибки в сервисах генерации/отправки**: Должны быть корректно обработаны, чтобы задача в BullMQ помечалась как `FAILED` и `VideoJob` в БД обновлялся.
- **Некорректная докеризация воркера**: Ошибки в `Dockerfile` или `docker-compose.yml` могут привести к тому, что воркер не запустится или не сможет подключиться к зависимостям.

## Файлы для изменения
- `src/worker.ts` (инициализация воркера)
- `src/queue/processors/greeting.ts` (модификация `createGreetingProcessor` для приема `botApi` и реализации логики обработки задачи)
- `Dockerfile` (настройка для запуска воркера)
- `docker-compose.yml` (добавление сервиса `worker`)

## Критерии приемки
- ✅ Воркер успешно запускается и подключается к Redis.
- ✅ Воркер забирает задачи из очереди `greeting`.
- ✅ Задачи успешно обрабатываются, статус `VideoJob` в БД обновляется.
- ✅ В случае ошибки обработки задачи, ее статус корректно устанавливается в `FAILED`.
- ✅ Реализован механизм graceful shutdown.
- ✅ Все важные события логируются.
- ✅ Воркер корректно запускается как Docker-контейнер через `docker-compose`.
