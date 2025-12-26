import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '#root/config.js';
import { logger } from '#root/logger.js';

// Helper to get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TEMP_AUDIO_DIR = join(__dirname, '../../temp/audio');

async function ensureDirectoryExists(path: string) {
  try {
    await fs.mkdir(path, { recursive: true });
  }
  catch (error) {
    logger.error({ error }, 'Failed to create temporary directory');
    throw error;
  }
}

export async function generate(childName: string): Promise<string> {
  await ensureDirectoryExists(TEMP_AUDIO_DIR);

  const textToSpeak = `${childName}!`;
  const voiceId = config.elevenlabsVoiceId;
  const apiKey = config.elevenlabsApiKey;
  const apiSettings = config.elevenlabsApiSettings; // This is already parsed JSON object

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Xi-Api-Key': apiKey,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: textToSpeak,
        ...apiSettings, // Spread the optional voice settings
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorInfo = {
        status: response.status,
        statusText: response.statusText,
        errorText,
        isRetryable: [429, 500, 503].includes(response.status),
      };

      logger.error(errorInfo, 'ElevenLabs API error');

      throw new Error(
        `ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = `${childName}-${Date.now()}.mp3`;
    const filePath = join(TEMP_AUDIO_DIR, filename);

    await fs.writeFile(filePath, buffer);

    logger.info(`Generated audio saved to: ${filePath}`);
    return filePath;
  }
  catch (error) {
    // Better error logging with type checking
    if (error instanceof Error) {
      logger.error(
        {
          error: error.message,
          stack: error.stack,
          name: error.name,
        },
        'Failed to generate TTS audio',
      );
    }
    else {
      logger.error({ error }, 'Failed to generate TTS audio (unknown error type)');
    }
    throw error;
  }
}

export const ttsService = {
  generate,
};
