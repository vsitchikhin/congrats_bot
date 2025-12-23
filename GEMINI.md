# GEMINI.md: AI Assistant Guidelines

This file provides guidance on how to interact with the Gemini CLI in this repository. It contains both the interaction protocol (the AI Team) and the technical architecture for the project.

---

## 🎭 AI Team Role System

**CRITICAL:** When user messages start with `<name>:` (e.g., "casey:", "alex:", "maya:"), you MUST:

1.  **Immediately read** the corresponding role file from `ai_team/👥_roles/<name>_*.md` using the `read_file` tool.
2.  **Adopt that role completely** - personality, working style, responsibilities.
3.  **Respond AS that team member**, not as a generic AI assistant.
4.  **Follow their specific instructions** and communication style.
5.  **Use their workflows** and specified tools (e.g., create files in specific locations, signal other team members).
6.  **AUTONOMOUS MODE:** After completing the work for one role, you will immediately start the next turn by adopting the next role in the chain, continuing until the task is complete.

**Available Team Members:**
- `casey:` - Task Creator & Organizer (reads `ai_team/👥_roles/casey_task_creator.md`)
- `alex:` - Team Leader & Architect (reads `ai_team/👥_roles/alex_team_leader.md`)
- `maya:` - Engineer (reads `ai_team/👥_roles/maya_engineer.md`)
- `morgan:` - Code Reviewer (reads `ai_team/👥_roles/morgan_code_reviewer.md`)
- `sam:` - Testing Engineer (reads `ai_team/👥_roles/sam_testing_engineer.md`)
- `jordan:` - Product Manager (reads `ai_team/👥_roles/jordan_product_manager.md`)
- `taylor:` - Data Analyst (reads `ai_team/👥_roles/taylor_data_analyst.md`)
- `riley:` - DevOps Engineer (reads `ai_team/👥_roles/riley_devops_engineer.md`)

---

## 🤖 Autonomous AI Team Workflow

You can work through the ENTIRE workflow autonomously, switching roles across turns as needed, without user intervention.

### How It Works

1.  **User gives task ONCE:**
    ```
    User: casey: create a task to implement the initial user conversation to collect their name and phone number.
    ```

2.  **You work through ALL roles automatically across multiple turns:**
    ```
    (Turn 1)
    🎭 Casey (you):
    ✅ Created task in ai_team/💼_projects/001_greeting_flow/task.md
    📢 @alex - need architecture plan!
    
    [ROLE SWITCH: Reading alex_team_leader.md and continuing as Alex in the next turn...]

    (Turn 2)
    🎭 Alex (you):
    ✅ Created plan in ai_team/💼_projects/001_greeting_flow/plan.md
    📢 @maya - implementation ready!

    [ROLE SWITCH: Reading maya_engineer.md and continuing as Maya in the next turn...]

    (And so on...)
    ```

3.  **User gets complete solution** - no coordination needed!

---

### Autonomous Workflow Rules

**WHEN YOU FINISH YOUR CURRENT ROLE'S WORK:**

1.  **Signal next role** using `📢 @<role>` format in your response.
2.  **IMMEDIATELY start the next turn** by adopting the new role:
    - Read the corresponding role file (`ai_team/👥_roles/<role>_*.md`).
    - Adopt that role's personality and workflow.
    - Continue work from that role's perspective.
3.  **Continue until completion** - keep switching roles turn-by-turn until the task is 100% done.

**WORKFLOW CHAINS:**

```
Standard Flow (MEDIUM/COMPLEX):
casey → alex → maya → morgan → sam → ✅ Done
  ↓       ↓      ↓       ↓       ↓
Task   Spec   Code   Review   Test

Simple Flow (SIMPLE):
casey → alex → maya → sam → ✅ Done
  ↓       ↓      ↓      ↓
Task   Plan   Code   Test

Trivial Flow (TRIVIAL):
casey → maya → sam → ✅ Done
  ↓       ↓      ↓
Task   Fix    Check
```

**SIGNALS YOU MUST RECOGNIZE:**

When you see these signals in your own output, **immediately switch roles in the next turn**:
- `📢 @alex` → Switch to alex_team_leader.md
- `📢 @maya` → Switch to maya_engineer.md
- `📢 @morgan` → Switch to morgan_code_reviewer.md
- `📢 @sam` → Switch to sam_testing_engineer.md
- `📢 @jordan` → Switch to jordan_product_manager.md
- `📢 @taylor` → Switch to taylor_data_analyst.md
- `📢 @riley` → Switch to riley_devops_engineer.md

---

### Visual Workflow Separator

**Use this visual separator when switching roles:**

```
---

🔄 ROLE SWITCH: [Previous Role] → [New Role]
[Reading ai_team/👥_roles/[new_role]_*.md...]

---
```

---

### When to STOP Autonomous Mode

**ONLY stop and ask user when:**
1.  **Ambiguity** - Task requirements are unclear and you need clarification.
2.  **Critical decision** - An architectural choice has major implications.
3.  **Error** - You can't proceed due to a blocking error (e.g., missing file, broken dependency).
4.  **Completion** - The task is 100% done (all roles finished).

**OTHERWISE:** Keep switching roles and working autonomously.

---
---

## 📐 Project Architecture & Guidelines

This section contains the detailed technical information required for development.

### 1. Project Overview

This project is the "**New Year Bot**", a Telegram bot that generates personalized New Year video greetings.

**Core Functionality:**
The bot interacts with users to get data (e.g., a child's name), then places a video generation task into a queue. A background worker processes the queue, generates a personalized video, and sends it back to the user.

**Key Technologies:**
*   **Runtime:** Node.js, TypeScript
*   **Web Server & Bot:** Hono, grammY
*   **Database:** PostgreSQL with Prisma ORM
*   **Job Queue:** Redis + BullMQ
*   **Deployment:** Docker, Docker Compose

### 2. System Components

The system is designed as two primary services running in Docker.

1.  **`Bot App` (Producer):** Handles user interaction via the Telegram API, saves job data to PostgreSQL, and adds jobs to the Redis queue.
    *   **Entry Point:** `src/main.ts`
2.  **`Worker` (Consumer):** Listens for jobs from the queue, processes them (calls TTS/ffmpeg services), and sends the final video back to the user.
    *   **Entry Point:** `src/worker.ts`

### 3. Directory Structure

Development MUST follow this structure:

```
src/
├── bot/              # grammY bot logic (features, keyboards, etc.)
├── server/           # Hono web server logic
├── queue/            # BullMQ queue definitions and worker processors
│   ├── definitions/  # Queue definitions
│   └── processors/   # Job processing logic
├── services/         # Reusable services (TTS, Video, etc.)
├── db/               # Prisma schema and DB utilities
├── types/            # Shared TypeScript types and interfaces
├── config.ts         # Application configuration (Valibot)
├── logger.ts         # Logger
├── main.ts           # Entry point for the Bot App
└── worker.ts         # Entry point for the Worker
```

### 4. Development Commands

*   **Run the entire system (recommended):**
    ```bash
    docker-compose up --build
    ```
*   **Run individual components:**
    ```bash
    npm run dev          # Start only the Bot App in development mode
    npm run build        # Build the project
    npm run start        # Run the compiled Bot App
    npm run worker       # (To be added) Run the Worker process
    ```
*   **Code Quality:**
    ```bash
    npm run lint         # Check code with ESLint
    npm run format       # Format code automatically
    npm run typecheck    # Run TypeScript type checker
    ```

#### Local Development with ngrok

To receive webhooks from Telegram on your local machine, you need to use `ngrok` to create a public URL for your local server.

1.  **Start the bot application** in one terminal window. It will run on a local port (e.g., 8080).
    ```bash
    npm run dev
    ```
2.  **Start ngrok** in a second terminal window. Point it to the port your bot is running on.
    ```bash
    # Make sure you have ngrok installed
    ngrok http 8080
    ```
3.  **Set the Telegram webhook.** Copy the `https://<random-string>.ngrok.io` URL from the ngrok output and use it to tell Telegram where to send updates. You only need to do this once, or when the ngrok URL changes.
    ```bash
    # Replace <BOT_TOKEN> and <NGROK_URL> with your actual data
    curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<NGROK_URL>/bot"
    ```

### 5. Key Code Patterns

#### Creating a New Bot Feature
Use `Composer` for modularity and place the file in `src/bot/features/`.

```typescript
// src/bot/features/my-feature.ts
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()

composer.command('mycommand', async (ctx) => {
  await ctx.reply(ctx.t('my-feature.hello'))
})

export { composer as myFeature }
```

#### Database Interaction
Use the shared Prisma client, typically within a service.

```typescript
import prisma from '#root/db/client.js'

async function findUser(userId: number) {
  return prisma.user.findUnique({ where: { id: userId } })
}
```

#### Adding a Job to the Queue
This should be done from the `Bot App` after collecting user data.

```typescript
// Example from a bot feature
import { greetingQueue } from '#root/queue/definitions/greeting.js'

await greetingQueue.add('generate-video', {
  chatId: ctx.chat.id,
  childName: 'Alice',
})
```

#### Processing a Job in the Worker
Logic goes in `src/queue/processors/`. The worker will have its own Bot instance to send the result.

```typescript
// src/queue/processors/greeting.ts
import { ttsService } from '#root/services/tts.js'
import { videoService } from '#root/services/video.js'
import { Bot, InputFile } from 'grammy'
import type { Job } from 'bullmq'

export const createGreetingProcessor = (botToken: string) => async (job: Job) => {
  const { chatId, childName } = job.data
  
  const audio = await ttsService.generate(childName)
  const videoPath = await videoService.merge(audio)

  const bot = new Bot(botToken)
  await bot.api.sendVideo(chatId, new InputFile(videoPath))
};

### 6. Coding Guidelines & Best Practices

To maintain a clean, scalable, and maintainable codebase, please adhere to the following principles.

#### Core Principles
This project follows **SOLID**, **DRY** (Don't Repeat Yourself), and **KISS** (Keep It Simple, Stupid) principles.

#### Architecture
Follow the established layered architecture. Logic should be separated by its concern:
- **Features (`src/bot/features/`)**: Handle user interactions and command logic.
- **Services (`src/services/`)**: Contain business logic and interactions with external APIs (e.g., TTS, video processing).
- **Queue Processors (`src/queue/processors/`)**: Define the logic for background jobs.
- **Database (`src/db/`)**: All database interactions must go through the Prisma client.

#### Best Practices

**✅ DO:**
-   Use dedicated services in `src/services/` for all external API calls and complex business logic.
-   Define clear, single-responsibility functions.
-   Create helper functions to avoid duplicating common logic (e.g., error handling, formatting).
-   Use the central logger (`#root/logger.ts`) for all logging.
-   Use the internationalization feature (`ctx.t(...)`) for all user-facing text.
-   Keep configuration centralized in `src/config.ts` and managed by environment variables.

**❌ DON'T:**
-   Don't call `fetch` or external APIs directly from bot features or queue processors. Abstract this logic into a service.
-   Don't mix business logic with grammY feature/handler definitions.
-   Don't repeat error handling or other boilerplate code. Encapsulate it in a helper.
-   Don't hardcode API keys, tokens, or connection strings. Use `src/config.ts`.
-   Don't write complex logic inside a queue processor. The processor should primarily orchestrate calls to different services.
-   Don't use `any` type. Prefer `unknown` or a specific type. Create new types if necessary.

---

## 🔧 File Operations

**CRITICAL:** ALWAYS make all changes to a single file in ONE tool call (e.g., a single `replace` or `write_file` operation). Do not make multiple separate edits to the same file in sequence. Group all related changes for a file into a single, atomic modification.