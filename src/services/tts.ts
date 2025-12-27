import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '#root/config.js';
import { logger } from '#root/logger.js';

export async function generate(childName: string): Promise<string> {
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

    // Use system temp directory instead of local ./temp folder
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const filename = `tts-${childName}-${timestamp}-${randomSuffix}.mp3`;
    const filePath = join(tmpdir(), filename);

    await fs.writeFile(filePath, buffer);

    logger.debug({ filePath }, 'Generated audio saved to temp');
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
