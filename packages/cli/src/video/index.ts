import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generatePlaywrightFromVideoFrames,
  generateYamlFromVideoFrames,
} from '@midscene/core/ai-model';
import type { VideoScriptFormat } from '@midscene/core/ai-model';
import { globalModelConfigManager } from '@midscene/shared/env';
import { extractFrames } from './extract-frames';

export interface Video2YamlOptions {
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
  /** Maximum number of frames to send to VLM (default: 20) */
  maxFrames?: number;
  /** Viewport width */
  viewportWidth?: number;
  /** Viewport height */
  viewportHeight?: number;
}

function getDefaultOutputPath(
  inputPath: string,
  format: VideoScriptFormat,
): string {
  const ext = format === 'playwright' ? '.test.ts' : '.yaml';
  return inputPath.replace(/\.[^.]+$/, ext);
}

export async function video2yaml(options: Video2YamlOptions): Promise<string> {
  const {
    input,
    output,
    format = 'yaml',
    url,
    description,
    fps = 1,
    maxFrames = 20,
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

  // Step 1: Extract frames from video
  console.log(
    `\n   Extracting frames from video (fps=${fps}, max=${maxFrames})...`,
  );

  const frames = extractFrames(inputPath, { fps, maxFrames });
  console.log(`   Extracted ${frames.length} frames`);

  if (frames.length === 0) {
    throw new Error('No frames could be extracted from the video');
  }

  // Step 2: Send frames to VLM for analysis
  const formatLabel = format === 'playwright' ? 'Playwright test' : 'YAML';
  console.log(
    `   Analyzing video frames with AI (generating ${formatLabel})...`,
  );

  const modelConfig = globalModelConfigManager.getModelConfig('default');

  const scriptOptions = { url, description, viewportWidth, viewportHeight };

  const result =
    format === 'playwright'
      ? await generatePlaywrightFromVideoFrames(
          frames,
          scriptOptions,
          modelConfig,
        )
      : await generateYamlFromVideoFrames(frames, scriptOptions, modelConfig);

  // Step 3: Write output
  writeFileSync(outputPath, result.content, 'utf-8');
  console.log(`   ${formatLabel} script saved to: ${outputPath}`);

  return outputPath;
}
