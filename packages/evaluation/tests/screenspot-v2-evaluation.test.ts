import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path, { resolve, join } from 'node:path';
import Insight, {
  type Rect,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
} from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import { vlLocateMode } from '@midscene/shared/env';
import { imageInfoOfBase64, saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { afterEach, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects } from './util';

// Configuration
dotenv.config({
  debug: true,
  override: true,
});

const CONCURRENCY = process.env.SCREENSPOT_CONCURRENCY
  ? Number.parseInt(process.env.SCREENSPOT_CONCURRENCY, 10)
  : 5;

// Types
interface Sample {
  _id: { $oid: string };
  filepath: string;
  instruction: string;
  action_detection: {
    bounding_box: [number, number, number, number];
  };
}

interface ProcessResult {
  success: boolean;
}

interface TestStats {
  correctCount: number;
  failCount: number;
  totalProcessed: number;
}

// Setup functions
function setupTestEnvironment() {
  const screenspotV2Path = resolve(__dirname, '../page-data/screenspot-v2');
  const outputTestResultPath = resolve(
    screenspotV2Path,
    'screenspot-v2-test-result',
  );
  const samplesPath = resolve(screenspotV2Path, 'samples.json');

  // Clean and create directories
  rmSync(outputTestResultPath, { recursive: true, force: true });
  mkdirSync(join(outputTestResultPath, 'success'), { recursive: true });
  mkdirSync(join(outputTestResultPath, 'failed'), { recursive: true });
  mkdirSync(join(outputTestResultPath, 'error'), { recursive: true });
  mkdirSync(join(outputTestResultPath, 'error', 'logs'), { recursive: true });

  return {
    screenspotV2Path,
    outputTestResultPath,
    samples: JSON.parse(readFileSync(samplesPath, 'utf-8')).samples as Sample[],
  };
}

// Image processing functions
async function loadAndProcessImage(
  filepath: string,
): Promise<{ imageBase64: string; size: any }> {
  const imageBuffer = await sharp(filepath).png().toBuffer();
  const imageBase64 = imageBuffer.toString('base64');
  const size = await imageInfoOfBase64(imageBase64);
  return { imageBase64, size };
}

// Error handling functions
async function handleError(
  error: unknown,
  sample: Sample,
  imageBase64: string,
  outputTestResultPath: string,
): Promise<ProcessResult> {
  console.error(`Error processing sample ${sample._id.$oid}:`, error);
  console.error('sample.filepath', sample.filepath);

  const errorLog = {
    timestamp: new Date().toISOString(),
    sampleId: sample._id.$oid,
    filepath: sample.filepath,
    error:
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error,
  };

  writeFileSync(
    join(
      outputTestResultPath,
      'error',
      'logs',
      `screenspot-v2-${sample._id.$oid}-error.log`,
    ),
    JSON.stringify(errorLog, null, 2),
  );

  if (imageBase64) {
    await saveBase64Image({
      base64Data: imageBase64,
      outputPath: join(
        outputTestResultPath,
        'error',
        `screenspot-v2-${sample._id.$oid}-error.png`,
      ),
    });
  }
  return { success: false };
}

// Sample processing functions
async function processSample(
  sample: Sample,
  screenspotV2Path: string,
  outputTestResultPath: string,
): Promise<ProcessResult> {
  let imageBase64 = '';
  try {
    const filepath = resolve(screenspotV2Path, sample.filepath);
    const { imageBase64: base64, size } = await loadAndProcessImage(filepath);
    imageBase64 = base64;

    if (!size || !size.width || !size.height) {
      console.error(`Invalid image size for sample ${sample._id.$oid}:`, size);
      return { success: false };
    }

    const mockContext = {
      screenshotBase64: `data:image/png;base64,${imageBase64}`,
      content: [],
      tree: {
        node: null,
        children: [],
      },
      size,
      url: '',
      timestamp: Date.now(),
    };

    const prompt = sample.instruction;
    const insight = new Insight(mockContext);
    const result = await insight.locate({ prompt });
    const { element, rect } = result;

    if (element && rect) {
      const groundTruthRect = sample.action_detection.bounding_box;
      const gtRect: Rect = {
        left: groundTruthRect[0] * size.width,
        top: groundTruthRect[1] * size.height,
        width: groundTruthRect[2] * size.width,
        height: groundTruthRect[3] * size.height,
      };

      const markedImage = await annotateRects(
        mockContext.screenshotBase64,
        [gtRect, element.rect, rect],
        prompt,
      );

      const isMatch = isRectInside(element.rect, gtRect);
      const resultPath = join(
        outputTestResultPath,
        isMatch ? 'success' : 'failed',
        `screenspot-v2-${sample._id.$oid}-annotated.png`,
      );

      await saveBase64Image({
        base64Data: markedImage,
        outputPath: resultPath,
      });

      return { success: isMatch };
    }

    return { success: false };
  } catch (error) {
    return handleError(error, sample, imageBase64, outputTestResultPath);
  }
}

// Progress reporting functions
function updateStats(stats: TestStats, result: ProcessResult): TestStats {
  const newStats = {
    ...stats,
    totalProcessed: stats.totalProcessed + 1,
  };

  if (result.success) {
    newStats.correctCount = stats.correctCount + 1;
  } else {
    newStats.failCount = stats.failCount + 1;
  }

  return newStats;
}

function printProgress(stats: TestStats, totalSamples: number): void {
  console.log(
    `Progress: ${stats.totalProcessed}/${totalSamples} (${((stats.totalProcessed / totalSamples) * 100).toFixed(1)}%) - Pass: ${stats.correctCount}, Fail: ${stats.failCount}`,
  );
}

function printFinalResults(stats: TestStats, totalSamples: number): number {
  const accuracy = stats.correctCount / totalSamples;
  console.log(
    `ScreenSpot-v2 Final Results:
    Total Samples: ${totalSamples}
    Passed: ${stats.correctCount}
    Failed: ${stats.failCount}
    Accuracy: ${accuracy.toFixed(4)}
    Concurrency: ${CONCURRENCY}`,
  );
  return accuracy;
}

// Main test
(process.env.SCREENSPOT_V2 ? test : test.skip)(
  'ScreenSpot-v2: evaluate mobile UI element locator',
  async () => {
    const { screenspotV2Path, outputTestResultPath, samples } =
      setupTestEnvironment();
    let stats: TestStats = {
      correctCount: 0,
      failCount: 0,
      totalProcessed: 0,
    };

    // Process samples in chunks based on concurrency
    for (let i = 0; i < samples.length; i += CONCURRENCY) {
      const chunk = samples.slice(i, i + CONCURRENCY);
      const chunkPromises = chunk.map((sample) =>
        processSample(sample, screenspotV2Path, outputTestResultPath),
      );

      const results = await Promise.all(chunkPromises);

      // Update stats for each result
      results.forEach((result) => {
        stats = updateStats(stats, result);
      });

      printProgress(stats, samples.length);
    }

    const accuracy = printFinalResults(stats, samples.length);
    expect(accuracy).toBeGreaterThan(0.5);
  },
  12 * 60 * 60 * 1000,
);

function isRectInside(rect1: Rect, rect2: Rect): boolean {
  return (
    rect1.left >= rect2.left &&
    rect1.top >= rect2.top &&
    rect1.left + rect1.width <= rect2.left + rect2.width &&
    rect1.top + rect1.height <= rect2.top + rect2.height
  );
}
