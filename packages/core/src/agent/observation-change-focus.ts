import { ScreenshotItem } from '@/screenshot-item';
import type { Rect, ScreenshotSequenceEvidenceFrame } from '@/types';
import { parseBase64 } from '@midscene/shared/img';
import { ifInNode } from '@midscene/shared/utils';
import type sharp from 'sharp';
import { selectEvenlySpacedIndices } from './observation-frame-selection';

const analysisMaxWidth = 768;
const analysisFrameLimit = 50;
const tileSize = 16;
const minimumChangeScore = 4;
const focusWidthRatio = 0.18;
const focusHeightRatio = 0.15;
const minimumFocusWidth = 320;
const minimumFocusHeight = 200;
const upscaledFocusWidth = 960;
const maximumFocusRegions = 6;
const maximumFocusFrames = 6;
const focusGridColumns = 2;
const focusLabelHeight = 64;
const analysisConcurrency = 4;
const renderConcurrency = 2;

export interface ObservationChangeFocus {
  frames: ScreenshotSequenceEvidenceFrame[];
  rect: Rect;
  rects: Rect[];
  measurementRects: Rect[];
  score: number;
  changes: ObservationRegionChange[][];
}

export interface ObservationRegionChange {
  meanAbsoluteDifference: number;
  brightnessDelta: number;
}

interface DecodedAnalysisFrame {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

interface ChangeCandidate {
  x: number;
  y: number;
  score: number;
  rect: Rect;
  measurementRect: Rect;
}

interface SourceFrame {
  screenshot: ScreenshotItem;
  sourceIndex: number;
}

interface RenderedCrop {
  buffer: Buffer;
  height: number;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  abortSignal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        abortSignal?.throwIfAborted();
        const index = nextIndex++;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function selectAnalysisFrames(screenshots: ScreenshotItem[]): SourceFrame[] {
  return selectEvenlySpacedIndices(screenshots.length, analysisFrameLimit).map(
    (sourceIndex) => ({ screenshot: screenshots[sourceIndex], sourceIndex }),
  );
}

const screenshotBuffer = (screenshot: ScreenshotItem): Buffer => {
  const { body } = parseBase64(screenshot.base64);
  return Buffer.from(body, 'base64');
};

async function analysisFrame(
  screenshot: ScreenshotItem,
  width: number,
  Sharp: typeof sharp,
): Promise<DecodedAnalysisFrame> {
  const { data, info } = await Sharp(screenshotBuffer(screenshot))
    .resize({ width, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function tileDifference(
  baseline: DecodedAnalysisFrame,
  candidate: DecodedAnalysisFrame,
  abortSignal?: AbortSignal,
): number[] {
  const columns = Math.ceil(baseline.width / tileSize);
  const rows = Math.ceil(baseline.height / tileSize);
  const scores = new Array(columns * rows).fill(0);
  for (let tileY = 0; tileY < rows; tileY += 1) {
    abortSignal?.throwIfAborted();
    for (let tileX = 0; tileX < columns; tileX += 1) {
      const startX = tileX * tileSize;
      const startY = tileY * tileSize;
      const endX = Math.min(startX + tileSize, baseline.width);
      const endY = Math.min(startY + tileSize, baseline.height);
      let difference = 0;
      let samples = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * baseline.width + x) * baseline.channels;
          for (let channel = 0; channel < 3; channel += 1) {
            difference += Math.abs(
              baseline.data[offset + channel] -
                candidate.data[offset + channel],
            );
            samples += 1;
          }
        }
      }
      scores[tileY * columns + tileX] = samples ? difference / samples : 0;
    }
  }
  return scores;
}

function overlapRatio(a: Rect, b: Rect): number {
  const width = Math.max(
    0,
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
  );
  const height = Math.max(
    0,
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
  );
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}

function measurementRect(
  imageWidth: number,
  imageHeight: number,
  analysisWidth: number,
  analysisHeight: number,
  tile: { x: number; y: number },
): Rect {
  const startX = Math.max(0, (tile.x - 1) * tileSize);
  const startY = Math.max(0, (tile.y - 1) * tileSize);
  const endX = Math.min(analysisWidth, (tile.x + 2) * tileSize);
  const endY = Math.min(analysisHeight, (tile.y + 2) * tileSize);
  const scaleX = imageWidth / analysisWidth;
  const scaleY = imageHeight / analysisHeight;
  const left = Math.floor(startX * scaleX);
  const top = Math.floor(startY * scaleY);
  const right = Math.min(imageWidth, Math.ceil(endX * scaleX));
  const bottom = Math.min(imageHeight, Math.ceil(endY * scaleY));
  return { left, top, width: right - left, height: bottom - top };
}

function focusRect(
  imageWidth: number,
  imageHeight: number,
  analysisWidth: number,
  analysisHeight: number,
  tile: { x: number; y: number },
): Rect {
  const scaleX = imageWidth / analysisWidth;
  const scaleY = imageHeight / analysisHeight;
  const centerX = (tile.x * tileSize + tileSize / 2) * scaleX;
  const centerY = (tile.y * tileSize + tileSize / 2) * scaleY;
  const width = Math.min(
    imageWidth,
    Math.max(minimumFocusWidth, Math.round(imageWidth * focusWidthRatio)),
  );
  const height = Math.min(
    imageHeight,
    Math.max(minimumFocusHeight, Math.round(imageHeight * focusHeightRatio)),
  );
  return {
    left: Math.max(
      0,
      Math.min(imageWidth - width, Math.round(centerX - width / 2)),
    ),
    top: Math.max(
      0,
      Math.min(imageHeight - height, Math.round(centerY - height / 2)),
    ),
    width,
    height,
  };
}

function strongestChangeTiles(
  scores: number[],
  columns: number,
  rows: number,
  imageWidth: number,
  imageHeight: number,
  analysisWidth: number,
  analysisHeight: number,
): ChangeCandidate[] {
  const candidates: ChangeCandidate[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let score = 0;
      let count = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(rows - 1, y + 1); ny++) {
        for (
          let nx = Math.max(0, x - 1);
          nx <= Math.min(columns - 1, x + 1);
          nx++
        ) {
          score += scores[ny * columns + nx];
          count++;
        }
      }
      score /= count;
      if (score >= minimumChangeScore) {
        candidates.push({
          x,
          y,
          score,
          rect: focusRect(
            imageWidth,
            imageHeight,
            analysisWidth,
            analysisHeight,
            { x, y },
          ),
          measurementRect: measurementRect(
            imageWidth,
            imageHeight,
            analysisWidth,
            analysisHeight,
            { x, y },
          ),
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selected: ChangeCandidate[] = [];
  for (const candidate of candidates) {
    if (
      !selected.some((item) => overlapRatio(candidate.rect, item.rect) > 0.35)
    ) {
      selected.push(candidate);
    }
    if (selected.length >= maximumFocusRegions) break;
  }
  return selected;
}

function luminance(data: Buffer, offset: number): number {
  return (
    data[offset] * 0.2126 +
    data[offset + 1] * 0.7152 +
    data[offset + 2] * 0.0722
  );
}

function localizedDifference(
  baseline: DecodedAnalysisFrame,
  candidate: DecodedAnalysisFrame,
  tile: { x: number; y: number },
): ObservationRegionChange {
  const startX = Math.max(0, (tile.x - 1) * tileSize);
  const startY = Math.max(0, (tile.y - 1) * tileSize);
  const endX = Math.min(baseline.width, (tile.x + 2) * tileSize);
  const endY = Math.min(baseline.height, (tile.y + 2) * tileSize);
  let absoluteDifference = 0;
  let brightnessDelta = 0;
  let samples = 0;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const offset = (y * baseline.width + x) * baseline.channels;
      const before = luminance(baseline.data, offset);
      const after = luminance(candidate.data, offset);
      absoluteDifference += Math.abs(after - before);
      brightnessDelta += after - before;
      samples++;
    }
  }
  return {
    meanAbsoluteDifference: samples ? absoluteDifference / samples : 0,
    brightnessDelta: samples ? brightnessDelta / samples : 0,
  };
}

function selectFrameIndices(
  changes: ObservationRegionChange[][],
  frameCount: number,
): number[] {
  if (frameCount <= maximumFocusFrames) {
    return Array.from({ length: frameCount }, (_, index) => index);
  }
  const scores = Array.from({ length: frameCount }, (_, frameIndex) =>
    Math.max(
      ...changes.map(
        (region) => region[frameIndex]?.meanAbsoluteDifference ?? 0,
      ),
    ),
  );
  const selected = new Set([0, frameCount - 1]);
  const interior = Array.from(
    { length: frameCount - 2 },
    (_, index) => index + 1,
  ).sort((a, b) => scores[b] - scores[a] || a - b);
  for (const index of interior) {
    if (selected.size >= maximumFocusFrames) break;
    selected.add(index);
  }
  return [...selected].sort((a, b) => a - b);
}

async function renderOutlinedCrop(
  source: sharp.Sharp,
  rect: Rect,
  measured: Rect,
  outputWidth: number,
  Sharp: typeof sharp,
): Promise<RenderedCrop> {
  const { data: crop, info } = await source
    .clone()
    .extract(rect)
    .resize({ width: outputWidth })
    .png()
    .toBuffer({ resolveWithObject: true });
  const outputHeight = info.height;
  const scaleX = outputWidth / rect.width;
  const scaleY = outputHeight / rect.height;
  const x = Math.max(0, Math.round((measured.left - rect.left) * scaleX));
  const y = Math.max(0, Math.round((measured.top - rect.top) * scaleY));
  const width = Math.min(
    outputWidth - x,
    Math.max(2, Math.round(measured.width * scaleX)),
  );
  const height = Math.min(
    outputHeight - y,
    Math.max(2, Math.round(measured.height * scaleY)),
  );
  const outline = Buffer.from(
    `<svg width="${outputWidth}" height="${outputHeight}"><rect x="${x + 2}" y="${y + 2}" width="${Math.max(1, width - 4)}" height="${Math.max(1, height - 4)}" fill="none" stroke="#ff7a00" stroke-width="4"/></svg>`,
  );
  const buffer = await Sharp(crop)
    .composite([{ input: outline }])
    .png()
    .toBuffer();
  return { buffer, height: outputHeight };
}

/** Build bounded, enlarged frame grids around localized visual changes. */
export async function buildObservationChangeFocus(
  screenshots: ScreenshotItem[],
  abortSignal?: AbortSignal,
): Promise<ObservationChangeFocus | undefined> {
  if (!ifInNode || screenshots.length < 2) return undefined;
  abortSignal?.throwIfAborted();
  const Sharp = (await import('sharp')).default;
  const analysisFrames = selectAnalysisFrames(screenshots);
  const metadata = await Sharp(
    screenshotBuffer(analysisFrames[0].screenshot),
  ).metadata();
  if (!metadata.width || !metadata.height) return undefined;

  const analysisWidth = Math.min(metadata.width, analysisMaxWidth);
  const baseline = await analysisFrame(
    analysisFrames[0].screenshot,
    analysisWidth,
    Sharp,
  );
  const frameScores = await mapWithConcurrency(
    analysisFrames.slice(1),
    analysisConcurrency,
    async ({ screenshot }) => {
      const frame = await analysisFrame(screenshot, analysisWidth, Sharp);
      if (frame.width !== baseline.width || frame.height !== baseline.height) {
        return undefined;
      }
      return tileDifference(baseline, frame, abortSignal);
    },
    abortSignal,
  );
  if (frameScores.some((scores) => !scores)) {
    return undefined;
  }

  const columns = Math.ceil(baseline.width / tileSize);
  const rows = Math.ceil(baseline.height / tileSize);
  const combinedScores = new Array(columns * rows).fill(0);
  for (const scores of frameScores) {
    if (!scores) continue;
    for (let index = 0; index < scores.length; index++) {
      combinedScores[index] = Math.max(combinedScores[index], scores[index]);
    }
  }
  const strongest = strongestChangeTiles(
    combinedScores,
    columns,
    rows,
    metadata.width,
    metadata.height,
    baseline.width,
    baseline.height,
  );
  if (!strongest.length) return undefined;

  const rects = strongest.map((candidate) => candidate.rect);
  const measurementRects = strongest.map(
    (candidate) => candidate.measurementRect,
  );
  const changesByFrame = [
    strongest.map(() => ({
      meanAbsoluteDifference: 0,
      brightnessDelta: 0,
    })),
    ...(await mapWithConcurrency(
      analysisFrames.slice(1),
      analysisConcurrency,
      async ({ screenshot }) => {
        const frame = await analysisFrame(screenshot, analysisWidth, Sharp);
        return strongest.map((candidate) =>
          localizedDifference(baseline, frame, candidate),
        );
      },
      abortSignal,
    )),
  ];
  const changes = strongest.map((_, regionIndex) =>
    changesByFrame.map((frameChanges) => frameChanges[regionIndex]),
  );
  const selectedAnalysisIndices = selectFrameIndices(
    changes,
    analysisFrames.length,
  );
  const frameIndices = selectedAnalysisIndices.map(
    (index) => analysisFrames[index].sourceIndex,
  );
  const outputWidth = Math.max(rects[0].width, upscaledFocusWidth);
  const frames = await mapWithConcurrency(
    frameIndices,
    renderConcurrency,
    async (sourceFrameIndex, renderedFrameIndex) => {
      const analysisFrameIndex = selectedAnalysisIndices[renderedFrameIndex];
      const screenshot = screenshots[sourceFrameIndex];
      const source = Sharp(screenshotBuffer(screenshot));
      const crops: RenderedCrop[] = [];
      for (let index = 0; index < rects.length; index++) {
        crops.push(
          await renderOutlinedCrop(
            source,
            rects[index],
            measurementRects[index],
            outputWidth,
            Sharp,
          ),
        );
      }
      const cropHeight = crops[0].height;
      const gridColumns = Math.min(focusGridColumns, crops.length);
      const gridRows = Math.ceil(crops.length / gridColumns);
      const cellHeight = cropHeight + focusLabelHeight;
      const composites = crops.flatMap(({ buffer }, index) => {
        const left = (index % gridColumns) * outputWidth;
        const top = Math.floor(index / gridColumns) * cellHeight;
        const change = changes[index][analysisFrameIndex];
        const brightness = `${change.brightnessDelta >= 0 ? '+' : ''}${change.brightnessDelta.toFixed(1)}`;
        const label = Buffer.from(
          `<svg width="${outputWidth}" height="${focusLabelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="16" y="24" fill="white" font-size="20" font-family="sans-serif">Region ${index + 1} · outlined peak patch vs Frame 1</text><text x="16" y="50" fill="white" font-size="20" font-family="sans-serif">brightness Δ ${brightness} · mean pixel Δ ${change.meanAbsoluteDifference.toFixed(1)}</text></svg>`,
        );
        return [
          { input: label, left, top },
          { input: buffer, left, top: top + focusLabelHeight },
        ];
      });
      const rendered = await Sharp({
        create: {
          width: gridColumns * outputWidth,
          height: gridRows * cellHeight,
          channels: 3,
          background: '#ffffff',
        },
      })
        .composite(composites)
        .jpeg({ quality: 92 })
        .toBuffer();
      return {
        screenshot: ScreenshotItem.create(
          `data:image/jpeg;base64,${rendered.toString('base64')}`,
          screenshot.capturedAt,
        ),
        sourceFrameIndex,
      };
    },
    abortSignal,
  );
  return {
    frames,
    rect: rects[0],
    rects,
    measurementRects,
    score: strongest[0].score,
    changes,
  };
}
