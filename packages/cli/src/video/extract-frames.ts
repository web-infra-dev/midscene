import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDebug } from '@midscene/shared/logger';

const debug = getDebug('cli:video');

export interface ExtractedFrame {
  base64: string;
  timestamp: number;
}

export interface ExtractFramesOptions {
  /** Frames per second to extract (default: 1) */
  fps?: number;
  /** Maximum number of frames to extract */
  maxFrames: number;
  /** Output image width in pixels (default: keep original, capped at 1920) */
  width?: number;
}

/**
 * Get ffmpeg executable path.
 * Priority: @ffmpeg-installer/ffmpeg npm package > system ffmpeg
 */
function getFfmpegPath(): string {
  try {
    const dynamicRequire = createRequire(__filename);
    const ffmpegInstaller = dynamicRequire('@ffmpeg-installer/ffmpeg');
    debug(`Using ffmpeg from npm package: ${ffmpegInstaller.path}`);
    return ffmpegInstaller.path;
  } catch (error) {
    debug(
      `npm ffmpeg package not found (${error}), falling back to system ffmpeg`,
    );
    return 'ffmpeg';
  }
}

/**
 * Get ffprobe executable path.
 * Priority: @ffprobe-installer/ffprobe npm package > system ffprobe
 */
function getFfprobePath(): string {
  try {
    const dynamicRequire = createRequire(__filename);
    const ffprobeInstaller = dynamicRequire('@ffprobe-installer/ffprobe');
    debug(`Using ffprobe from npm package: ${ffprobeInstaller.path}`);
    return ffprobeInstaller.path;
  } catch (error) {
    debug(
      `npm ffprobe package not found (${error}), falling back to system ffprobe`,
    );
    return 'ffprobe';
  }
}

/**
 * Check if ffmpeg is available (either npm package or system install)
 */
export function checkFfmpeg(): boolean {
  try {
    const ffmpegPath = getFfmpegPath();
    const result = spawnSync(ffmpegPath, ['-version'], {
      stdio: 'pipe',
      timeout: 5000,
    });
    debug(`ffmpeg check result: status=${result.status}`);
    return result.status === 0;
  } catch (error) {
    debug(`ffmpeg check failed: ${error}`);
    return false;
  }
}

/**
 * Get video duration in seconds using ffprobe
 */
function getVideoDuration(videoPath: string): number {
  const ffprobePath = getFfprobePath();
  const result = spawnSync(
    ffprobePath,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      videoPath,
    ],
    { stdio: 'pipe', timeout: 10000 },
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to get video duration: ${result.stderr?.toString() || 'unknown error'}`,
    );
  }

  const duration = Number.parseFloat(result.stdout.toString().trim());
  if (Number.isNaN(duration)) {
    throw new Error('Could not parse video duration');
  }
  return duration;
}

/**
 * Extract frames from a video file using ffmpeg.
 *
 * Returns an array of base64-encoded JPEG images with their timestamps.
 */
export function extractFrames(
  videoPath: string,
  options: ExtractFramesOptions,
): ExtractedFrame[] {
  const { fps = 1, maxFrames, width } = options;

  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  if (!checkFfmpeg()) {
    throw new Error(
      'ffmpeg is not available.\n' +
        'To fix this, either:\n' +
        '  1. Install the npm package: pnpm add -D @ffmpeg-installer/ffmpeg\n' +
        '  2. Or install system ffmpeg: https://ffmpeg.org/download.html',
    );
  }

  // Get video duration to compute timestamps
  const duration = getVideoDuration(videoPath);

  // Compute actual FPS to not exceed maxFrames
  const totalFramesAtFps = Math.ceil(duration * fps);
  const actualFps = totalFramesAtFps > maxFrames ? maxFrames / duration : fps;

  // Create temp directory for extracted frames
  const tempDir = join(tmpdir(), `midscene-video-frames-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Build ffmpeg filter
    const filters: string[] = [`fps=${actualFps}`];
    if (width) {
      filters.push(`scale=${Math.min(width, 1920)}:-1`);
    } else {
      // Cap width at 1920 to manage token usage
      filters.push('scale=min(iw\\,1920):-1');
    }

    const ffmpegPath = getFfmpegPath();
    const ffmpegArgs = [
      '-i',
      videoPath,
      '-vf',
      filters.join(','),
      '-q:v',
      '2', // JPEG quality (2 = high quality)
      '-frames:v',
      String(maxFrames),
      join(tempDir, 'frame_%04d.jpg'),
    ];

    const result = spawnSync(ffmpegPath, ffmpegArgs, {
      stdio: 'pipe',
      timeout: 120000, // 2 minutes timeout
    });

    if (result.status !== 0) {
      throw new Error(
        `ffmpeg failed: ${result.stderr?.toString() || 'unknown error'}`,
      );
    }

    // Read extracted frames
    const frameFiles = readdirSync(tempDir)
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < frameFiles.length; i++) {
      const filePath = join(tempDir, frameFiles[i]);
      const buffer = readFileSync(filePath);
      const base64 = buffer.toString('base64');

      // Compute approximate timestamp
      const timestamp = i / actualFps;

      frames.push({
        base64: `data:image/jpeg;base64,${base64}`,
        timestamp,
      });
    }

    return frames;
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
