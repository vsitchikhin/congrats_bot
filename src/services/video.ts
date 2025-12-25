import type { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '#root/config.js';
import { logger } from '#root/logger.js';

/**
 * Merges a video file with an audio file using ffmpeg.
 *
 * @param videoPath - Path to the input video file.
 * @param audioPath - Path to the input audio file.
 * @param outputPath - Path where the output video will be saved.
 * @returns A promise that resolves when the merge is complete, or rejects on error.
 */
async function mergeVideoAndAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-y',
      outputPath,
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.stdout.on('data', (data: Buffer) => {
      logger.trace(`ffmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      logger.trace(`ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code: number | null) => {
      if (code === 0) {
        logger.debug(`ffmpeg process exited with code ${code}`);
        resolve();
      }
      else {
        const err = new Error(`ffmpeg process exited with code ${code}`);
        logger.error({ err }, err.message);
        reject(err);
      }
    });

    ffmpegProcess.on('error', (err: Error) => {
      logger.error({ err }, 'Failed to start ffmpeg process.');
      reject(err);
    });
  });
}

/**
 * Merges the source video template with generated audio at a specific timecode.
 * Creates a personalized video with the audio inserted at the configured timecode.
 *
 * @param audioPath - Path to the generated audio file (child's name).
 * @returns A promise that resolves to the path of the generated video file.
 */
async function mergeAudioWithVideo(audioPath: string): Promise<string> {
  // Ensure temp directory exists
  const tempDir = './temp/videos';
  await mkdir(tempDir, { recursive: true });

  // Generate unique output filename
  const timestamp = Date.now();
  const outputPath = join(tempDir, `final-video-${timestamp}.mp4`);

  // Get configuration
  const sourceVideoPath = config.sourceVideoPath;
  const timecode = config.audioInsertTimecode;

  logger.debug(`Merging audio with video: source=${sourceVideoPath}, audio=${audioPath}, timecode=${timecode}`);

  return new Promise((resolve, reject) => {
    // ffmpeg command to overlay audio at specific timecode
    // -i: input video
    // -i: input audio
    // -filter_complex: use adelay to delay the audio stream by the timecode offset
    // -c:v copy: copy video stream without re-encoding
    // -c:a aac: encode audio to AAC
    // -map: select streams to include in output
    const ffmpegArgs = [
      '-i',
      sourceVideoPath,
      '-i',
      audioPath,
      '-filter_complex',
      `[1:a]adelay=${timecodeToMilliseconds(timecode)}|${timecodeToMilliseconds(timecode)}[delayed];[0:a][delayed]amix=inputs=2:duration=first[aout]`,
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-y',
      outputPath,
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.stdout.on('data', (data: Buffer) => {
      logger.trace(`ffmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      logger.trace(`ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code: number | null) => {
      if (code === 0) {
        logger.debug(`Video merged successfully: ${outputPath}`);
        resolve(outputPath);
      }
      else {
        const err = new Error(`ffmpeg process exited with code ${code}`);
        logger.error({ err }, err.message);
        reject(err);
      }
    });

    ffmpegProcess.on('error', (err: Error) => {
      logger.error({ err }, 'Failed to start ffmpeg process.');
      reject(err);
    });
  });
}

/**
 * Converts timecode to milliseconds for ffmpeg adelay filter.
 * Supports formats: H:MM:SS:FF or HH:MM:SS:FF
 * Where FF is frames (assuming 25 fps for conversion)
 *
 * @param timecode - Timecode string (e.g., "1:00:28:21")
 * @returns Milliseconds
 */
function timecodeToMilliseconds(timecode: string): number {
  const parts = timecode.split(':');
  if (parts.length !== 4) {
    throw new Error(`Invalid timecode format: ${timecode}. Expected H:MM:SS:FF or HH:MM:SS:FF`);
  }

  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  const seconds = Number.parseInt(parts[2], 10);
  const frames = Number.parseInt(parts[3], 10);

  // Convert to milliseconds (assuming 25 fps)
  const fps = 25;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds + frames / fps;
  return Math.round(totalSeconds * 1000);
}

export const videoService = {
  merge: mergeVideoAndAudio,
  mergeAudioWithVideo,
};
