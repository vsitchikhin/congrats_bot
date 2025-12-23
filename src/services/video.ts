import type { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { logger } from '#root/logger.js';
import ffmpegPath from 'ffmpeg-static';

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

    const ffmpegProcess = spawn(ffmpegPath as unknown as string, ffmpegArgs);

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

export const videoService = {
  merge: mergeVideoAndAudio,
};
