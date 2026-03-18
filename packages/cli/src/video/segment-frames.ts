import { spawnSync } from 'node:child_process';
import { getDebug } from '@midscene/shared/logger';
import type { ExtractedFrame } from './extract-frames';
import { getFfmpegPath } from './extract-frames';

const debug = getDebug('cli:video');

export interface FrameSegment {
  frames: ExtractedFrame[];
  startTimestamp: number;
  endTimestamp: number;
  segmentIndex: number;
}

/**
 * Detect scene change timestamps in a video using ffmpeg's scene filter.
 *
 * @param videoPath Path to the video file
 * @param threshold Scene change sensitivity (0-1). Lower = more scene changes detected. Default: 0.3
 * @returns Sorted array of timestamps (in seconds) where scene changes occur
 */
export function detectSceneChanges(
  videoPath: string,
  threshold = 0.3,
): number[] {
  const clampedThreshold = Math.max(0, Math.min(1, threshold));
  const ffmpegPath = getFfmpegPath();

  const result = spawnSync(
    ffmpegPath,
    [
      '-i',
      videoPath,
      '-vf',
      `select='gt(scene,${clampedThreshold})',showinfo`,
      '-f',
      'null',
      '-',
    ],
    { stdio: 'pipe', timeout: 120000 },
  );

  if (result.error || (result.status !== 0 && result.status !== null)) {
    debug(
      `Scene detection failed (${result.error?.message ?? result.stderr?.toString().slice(0, 200)}), falling back to even splitting`,
    );
    return [];
  }

  // ffmpeg outputs showinfo to stderr
  const output = result.stderr?.toString() || '';
  const timestamps = parseSceneTimestamps(output);

  debug(
    `Detected ${timestamps.length} scene changes at: ${timestamps.map((t) => t.toFixed(1)).join(', ')}`,
  );
  return timestamps;
}

/**
 * Parse scene change timestamps from ffmpeg showinfo output.
 */
export function parseSceneTimestamps(output: string): number[] {
  const timestamps: number[] = [];
  const ptsRegex = /pts_time:\s*([\d.]+)/g;

  for (const match of output.matchAll(ptsRegex)) {
    const ts = Number.parseFloat(match[1]);
    if (!Number.isNaN(ts)) {
      timestamps.push(ts);
    }
  }

  return timestamps.sort((a, b) => a - b);
}

/**
 * Split extracted frames into segments for separate VLM analysis.
 *
 * Uses scene change timestamps as preferred split points.
 * If no scene changes are detected, splits evenly.
 * Adds 1-frame overlap at boundaries for context continuity.
 *
 * @param frames All extracted frames
 * @param sceneTimestamps Scene change timestamps from detectSceneChanges
 * @param maxPerSegment Maximum frames per segment (default: 15)
 * @returns Array of frame segments
 */
export function segmentFrames(
  frames: ExtractedFrame[],
  sceneTimestamps: number[],
  maxPerSegment = 15,
): FrameSegment[] {
  if (frames.length === 0) {
    return [];
  }

  if (frames.length <= maxPerSegment) {
    return [
      {
        frames,
        startTimestamp: frames[0].timestamp,
        endTimestamp: frames[frames.length - 1].timestamp,
        segmentIndex: 0,
      },
    ];
  }

  // Build split points from scene timestamps
  const splitIndices: number[] = [];
  for (const ts of sceneTimestamps) {
    // Find the frame index closest to this scene timestamp
    let bestIdx = 0;
    let bestDiff = Math.abs(frames[0].timestamp - ts);
    for (let i = 1; i < frames.length; i++) {
      const diff = Math.abs(frames[i].timestamp - ts);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx > 0 && bestIdx < frames.length - 1) {
      splitIndices.push(bestIdx);
    }
  }

  // Deduplicate and sort
  const uniqueSplits = [...new Set(splitIndices)].sort((a, b) => a - b);

  // Build initial segments from scene boundaries
  const rawSegments: { start: number; end: number }[] = [];
  let prevStart = 0;
  for (const splitIdx of uniqueSplits) {
    if (splitIdx > prevStart) {
      rawSegments.push({ start: prevStart, end: splitIdx });
      prevStart = splitIdx;
    }
  }
  // Add the last segment
  if (prevStart < frames.length) {
    rawSegments.push({ start: prevStart, end: frames.length });
  }

  // If no scene changes found, create one segment covering all frames
  if (rawSegments.length === 0) {
    rawSegments.push({ start: 0, end: frames.length });
  }

  // Split segments that exceed maxPerSegment
  const finalSegments: { start: number; end: number }[] = [];
  for (const seg of rawSegments) {
    const segLen = seg.end - seg.start;
    if (segLen <= maxPerSegment) {
      finalSegments.push(seg);
    } else {
      // Split evenly
      const numParts = Math.ceil(segLen / maxPerSegment);
      const partSize = Math.ceil(segLen / numParts);
      for (let i = 0; i < numParts; i++) {
        const start = seg.start + i * partSize;
        const end = Math.min(seg.start + (i + 1) * partSize, seg.end);
        if (start < end) {
          finalSegments.push({ start, end });
        }
      }
    }
  }

  // Build FrameSegment[] with 1-frame overlap
  const result: FrameSegment[] = [];
  for (let i = 0; i < finalSegments.length; i++) {
    const seg = finalSegments[i];
    // Add overlap: include the last frame of previous segment
    const overlapStart = i > 0 ? seg.start - 1 : seg.start;
    const segFrames = frames.slice(overlapStart, seg.end);

    result.push({
      frames: segFrames,
      startTimestamp: segFrames[0].timestamp,
      endTimestamp: segFrames[segFrames.length - 1].timestamp,
      segmentIndex: i,
    });
  }

  return result;
}
