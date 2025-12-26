import { promises as fs } from 'node:fs';
import { config } from '#root/config.js';
import { ttsService } from '#root/services/tts.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config values
vi.mock('#root/config.js', () => ({
  config: {
    logLevel: 'silent', // Add this to prevent pino from crashing
    elevenlabsApiKey: 'test-api-key',
    elevenlabsVoiceId: 'test-voice-id',
    elevenlabsApiSettings: { voice_settings: { stability: 0.5 } },
  },
}));

// Mock fs.mkdir and fs.writeFile to avoid actual file system operations
vi.mock('node:fs', async () => {
  const originalFs = await vi.importActual('node:fs');
  return {
    ...originalFs,
    promises: {
      // Explicitly define mocked functions, do not spread originalFs.promises
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('ttsService', () => {
  const childName = 'test-child';

  beforeEach(() => {
    // Mock global fetch
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate and save an audio file successfully', async () => {
    const mockAudioStream = new ArrayBuffer(8);
    const response = {
      ok: true,
      arrayBuffer: async () => Promise.resolve(mockAudioStream),
    };
    (fetch as any).mockResolvedValue(response);

    const filePath = await ttsService.generate(childName);

    expect(fetch).toHaveBeenCalledWith(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabsVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Xi-Api-Key': config.elevenlabsApiKey,
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: `${childName}!`,
          ...config.elevenlabsApiSettings,
        }),
      },
    );

    expect(fs.writeFile).toHaveBeenCalled();
    expect(filePath).toContain(`${childName}-`);
    expect(filePath).toContain('.mp3');
  });

  it('should throw an error if the API call fails', async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => Promise.resolve(''), // Changed to empty string
    };
    (fetch as any).mockResolvedValue(errorResponse);

    await expect(ttsService.generate(childName)).rejects.toThrow(
      'ElevenLabs API error: 500 Internal Server Error', // Adjusted expected error message
    );
  });

  it('should throw an error if the fetch call fails (network error)', async () => {
    const networkError = new Error('Network failure');
    (fetch as any).mockRejectedValue(networkError);

    await expect(ttsService.generate(childName)).rejects.toThrow('Network failure');
  });

  it('should throw an error if writing the file fails', async () => {
    const writeError = new Error('Failed to write file');
    (fs.writeFile as any).mockRejectedValue(writeError);

    const mockAudioStream = new ArrayBuffer(8);
    const response = {
      ok: true,
      arrayBuffer: async () => Promise.resolve(mockAudioStream),
    };
    (fetch as any).mockResolvedValue(response);

    await expect(ttsService.generate(childName)).rejects.toThrow('Failed to write file');
  });
});
