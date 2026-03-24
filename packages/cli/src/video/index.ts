import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateFromVideoSegment,
  generatePlaywrightFromVideoFrames,
  generatePuppeteerFromVideoFrames,
  generateYamlFromVideoFrames,
  mergeSegmentResults,
} from '@midscene/core/ai-model';
import type { VideoScriptFormat } from '@midscene/core/ai-model';
import { globalModelConfigManager } from '@midscene/shared/env';
import { extractFrames, getVideoDuration } from './extract-frames';
import { detectSceneChanges, segmentFrames } from './segment-frames';

/** Threshold: if total frames exceed this, use segmented processing */
const SEGMENT_THRESHOLD = 20;

/** Maximum total frames to extract from a video to prevent OOM */
const MAX_TOTAL_FRAMES = 600;

export interface CodegenOptions {
  /** Path to the video file */
  input: string;
  /** Output file path (default: <input>.yaml or <input>.test.ts) */
  output?: string;
  /** Output format: yaml or playwright (default: yaml) */
  format?: VideoScriptFormat;
  /** Starting URL of the web page in the video */
  url?: string;
  /** Description of what the video demonstrates */
  description?: string;
  /** Frames per second to extract (default: 1) */
  fps?: number;
  /** Maximum number of frames to send to VLM (default: 20, used for short videos) */
  maxFrames?: number;
  /** Maximum frames per segment for long video processing (default: 15) */
  maxFramesPerSegment?: number;
  /** Scene change detection sensitivity 0-1, lower = more segments (default: 0.3) */
  sceneThreshold?: number;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
}

function getDefaultOutputPath(
  inputPath: string,
  format: VideoScriptFormat,
): string {
  const ext = format === 'yaml' ? '.yaml' : '.ts';
  return inputPath.replace(/\.[^.]+$/, ext);
}

export async function codegen(options: CodegenOptions): Promise<string> {
  const {
    input,
    output,
    format = 'yaml',
    url,
    description,
    fps = 1,
    maxFrames = 20,
    maxFramesPerSegment = 15,
    sceneThreshold = 0.3,
    viewportWidth,
    viewportHeight,
  } = options;

  const inputPath = resolve(input);
  if (!existsSync(inputPath)) {
    throw new Error(`Video file not found: ${inputPath}`);
  }

  const outputPath = output
    ? resolve(output)
    : getDefaultOutputPath(inputPath, format);

  const modelConfig = globalModelConfigManager.getModelConfig('default');
  const scriptOptions = { url, description, viewportWidth, viewportHeight };
  const formatLabel =
    format === 'yaml'
      ? 'YAML'
      : format === 'puppeteer'
        ? 'Puppeteer script'
        : 'Playwright test';

  // Determine if we need segmented processing
  const duration = getVideoDuration(inputPath);
  const estimatedFrames = Math.ceil(duration * fps);
  // maxFrames is the global budget; cap by MAX_TOTAL_FRAMES for safety
  const effectiveMaxFrames = Math.min(maxFrames, MAX_TOTAL_FRAMES);
  const needsSegmentation = estimatedFrames > effectiveMaxFrames;

  if (!needsSegmentation) {
    // --- Short video: single VLM call ---
    console.log(
      `\n   Extracting frames from video (fps=${fps}, max=${effectiveMaxFrames})...`,
    );
    const frames = extractFrames(inputPath, {
      fps,
      maxFrames: effectiveMaxFrames,
    });
    console.log(`   Extracted ${frames.length} frames`);

    if (frames.length === 0) {
      throw new Error('No frames could be extracted from the video');
    }

    console.log(
      `   Analyzing video frames with AI (generating ${formatLabel})...`,
    );

    const generateFn =
      format === 'yaml'
        ? generateYamlFromVideoFrames
        : format === 'puppeteer'
          ? generatePuppeteerFromVideoFrames
          : generatePlaywrightFromVideoFrames;
    const result = await generateFn(frames, scriptOptions, modelConfig);

    writeFileSync(outputPath, result.content, 'utf-8');
    console.log(`   ${formatLabel} script saved to: ${outputPath}`);
    return outputPath;
  }

  // --- Long video: segmented processing ---
  console.log(
    `\n   Long video detected (${duration.toFixed(1)}s, ~${estimatedFrames} frames at ${fps} FPS)`,
  );
  const cappedFrames = Math.min(estimatedFrames, effectiveMaxFrames);
  if (estimatedFrames > effectiveMaxFrames) {
    console.log(
      `   Capping at ${effectiveMaxFrames} frames (video has ~${estimatedFrames})`,
    );
  }
  console.log(`   Extracting frames (fps=${fps}, max=${cappedFrames})...`);

  const allFrames = extractFrames(inputPath, {
    fps,
    maxFrames: cappedFrames,
  });
  console.log(`   Extracted ${allFrames.length} frames`);

  if (allFrames.length === 0) {
    throw new Error('No frames could be extracted from the video');
  }

  // Detect scene changes for intelligent splitting
  console.log('   Detecting scene changes...');
  const sceneTimestamps = detectSceneChanges(inputPath, sceneThreshold);
  console.log(`   Found ${sceneTimestamps.length} scene change(s)`);

  // Split into segments
  const segments = segmentFrames(
    allFrames,
    sceneTimestamps,
    maxFramesPerSegment,
  );
  console.log(`   Split into ${segments.length} segments for analysis`);

  // Analyze each segment
  const segmentResults: string[] = [];
  for (const segment of segments) {
    console.log(
      `   Analyzing segment ${segment.segmentIndex + 1}/${segments.length} (${segment.startTimestamp.toFixed(1)}s - ${segment.endTimestamp.toFixed(1)}s, ${segment.frames.length} frames)...`,
    );
    const result = await generateFromVideoSegment(
      segment.frames,
      scriptOptions,
      {
        index: segment.segmentIndex,
        total: segments.length,
        timeRange: [segment.startTimestamp, segment.endTimestamp],
      },
      modelConfig,
    );
    // Skip empty segments
    if (result.content && result.content !== 'NO_ACTIONS') {
      segmentResults.push(result.content);
    }
  }

  if (segmentResults.length === 0) {
    throw new Error('No actions could be detected from the video');
  }

  // Merge all segment results
  console.log(
    `   Merging ${segmentResults.length} segment results into final ${formatLabel}...`,
  );
  const merged = await mergeSegmentResults(
    segmentResults,
    scriptOptions,
    format,
    modelConfig,
  );

  writeFileSync(outputPath, merged.content, 'utf-8');
  console.log(`   ${formatLabel} script saved to: ${outputPath}`);
  return outputPath;
}
