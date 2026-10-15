import { ScreenshotItem } from '@/screenshot-item';
import type { Rect, ScreenshotSequenceEvidenceFrame } from '@/types';
import { parseBase64 } from '@midscene/shared/img';
import { ifInNode } from '@midscene/shared/utils';
import type sharp from 'sharp';

const analysisMaxWidth = 768;
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
  regions: ObservationFocusRegion[];
}

export interface ObservationFocusRegion {
  rect: Rect;
  measurementRect: Rect;
}

interface ObservationRegionChange {
  meanAbsoluteDifference: number;
  brightnessDelta: number;
}

interface DecodedAnalysisFrame {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

interface ChangeCandidate extends ObservationFocusRegion {
  score: number;
  analysisRect: Rect;
  changes: ObservationRegionChange[];
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

const screenshotBuffer = (screenshot: ScreenshotItem): Buffer => {
  const { body } = parseBase64(screenshot.base64);
  return Buffer.from(body, 'base64');
};

async function analysisFrame(
  screenshot: ScreenshotItem,
  region: Rect,
  dimensions: { width: number; height: number },
  Sharp: typeof sharp,
): Promise<DecodedAnalysisFrame> {
  const source = Sharp(screenshotBuffer(screenshot));
  const metadata = await source.metadata();
  if (
    metadata.width !== dimensions.width ||
    metadata.height !== dimensions.height
  ) {
    throw new Error(
      'Observation source frames must have matching original dimensions for change-region analysis',
    );
  }
  // Crop before resizing: otherwise interpolation can leak pixels outside the ROI
  // into both detection and transition measurements.
  const { data, info } = await source
    .extract(region)
    .resize({
      width: Math.min(region.width, analysisMaxWidth),
      withoutEnlargement: true,
    })
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
  region: Rect,
  analysisWidth: number,
  analysisHeight: number,
  patch: Rect,
): Rect {
  const scaleX = region.width / analysisWidth;
  const scaleY = region.height / analysisHeight;
  const left = region.left + Math.floor(patch.left * scaleX);
  const top = region.top + Math.floor(patch.top * scaleY);
  const right =
    region.left +
    Math.min(region.width, Math.ceil((patch.left + patch.width) * scaleX));
  const bottom =
    region.top +
    Math.min(region.height, Math.ceil((patch.top + patch.height) * scaleY));
  return { left, top, width: right - left, height: bottom - top };
}

function focusRect(
  imageWidth: number,
  imageHeight: number,
  measured: Rect,
): Rect {
  const centerX = measured.left + measured.width / 2;
  const centerY = measured.top + measured.height / 2;
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
  region: Rect,
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
        const left = Math.max(0, (x - 1) * tileSize);
        const top = Math.max(0, (y - 1) * tileSize);
        const analysisRect = {
          left,
          top,
          width: Math.min(analysisWidth, (x + 2) * tileSize) - left,
          height: Math.min(analysisHeight, (y + 2) * tileSize) - top,
        };
        const measured = measurementRect(
          region,
          analysisWidth,
          analysisHeight,
          analysisRect,
        );
        candidates.push({
          score,
          rect: focusRect(imageWidth, imageHeight, measured),
          measurementRect: measured,
          analysisRect,
          changes: [{ meanAbsoluteDifference: 0, brightnessDelta: 0 }],
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
  patch: Rect,
): ObservationRegionChange {
  let absoluteDifference = 0;
  let brightnessDelta = 0;
  let samples = 0;
  for (let y = patch.top; y < patch.top + patch.height; y++) {
    for (let x = patch.left; x < patch.left + patch.width; x++) {
      const offset = (y * baseline.width + x) * baseline.channels;
      const before = luminance(baseline.data, offset);
      const after = luminance(candidate.data, offset);
      for (let channel = 0; channel < 3; channel++) {
        absoluteDifference +=
          Math.abs(
            candidate.data[offset + channel] - baseline.data[offset + channel],
          ) / 3;
      }
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
  scores: number[],
  transitionScores: number[],
): number[] {
  const frameCount = scores.length;
  if (frameCount <= maximumFocusFrames) {
    return Array.from({ length: frameCount }, (_, index) => index);
  }
  const selected = new Set([0, frameCount - 1]);
  const transitions = Array.from(
    { length: frameCount - 1 },
    (_, index) => index + 1,
  )
    .filter((index) => transitionScores[index] >= minimumChangeScore)
    .sort((a, b) => transitionScores[b] - transitionScores[a] || a - b);
  for (const index of transitions) {
    const boundary = [index - 1, index].filter(
      (frameIndex) => !selected.has(frameIndex),
    );
    if (selected.size + boundary.length > maximumFocusFrames) continue;
    for (const frameIndex of boundary) selected.add(frameIndex);
  }
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
  observationRegion?: Rect,
): Promise<ObservationChangeFocus | undefined> {
  if (!ifInNode) {
    if (observationRegion)
      throw new Error('observationRegion requires Node.js image analysis');
    return undefined;
  }
  if (screenshots.length < 2) return undefined;
  abortSignal?.throwIfAborted();
  const Sharp = (await import('sharp')).default;
  const metadata = await Sharp(screenshotBuffer(screenshots[0])).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error('Observation image dimensions are missing');
  if (
    observationRegion &&
    (![
      observationRegion.left,
      observationRegion.top,
      observationRegion.width,
      observationRegion.height,
    ].every(Number.isFinite) ||
      observationRegion.left < 0 ||
      observationRegion.top < 0 ||
      observationRegion.width <= 0 ||
      observationRegion.height <= 0 ||
      observationRegion.left + observationRegion.width > metadata.width ||
      observationRegion.top + observationRegion.height > metadata.height)
  ) {
    throw new Error(
      'observationRegion must be a finite, positive rectangle inside the prepared screenshot',
    );
  }

  const dimensions = { width: metadata.width, height: metadata.height };
  const requestedRegion = observationRegion ?? {
    left: 0,
    top: 0,
    ...dimensions,
  };
  // Fractional bounds include only whole pixels contained in the requested ROI.
  const analysisRegion = {
    left: Math.ceil(requestedRegion.left),
    top: Math.ceil(requestedRegion.top),
    width:
      Math.floor(requestedRegion.left + requestedRegion.width) -
      Math.ceil(requestedRegion.left),
    height:
      Math.floor(requestedRegion.top + requestedRegion.height) -
      Math.ceil(requestedRegion.top),
  };
  if (analysisRegion.width < 1 || analysisRegion.height < 1) {
    throw new Error(
      'observationRegion must contain at least one whole screenshot pixel',
    );
  }
  const baseline = await analysisFrame(
    screenshots[0],
    analysisRegion,
    dimensions,
    Sharp,
  );
  const columns = Math.ceil(baseline.width / tileSize);
  const rows = Math.ceil(baseline.height / tileSize);
  const combinedScores = new Array(columns * rows).fill(0);
  await mapWithConcurrency(
    screenshots.slice(1),
    analysisConcurrency,
    async (screenshot) => {
      const frame = await analysisFrame(
        screenshot,
        analysisRegion,
        dimensions,
        Sharp,
      );
      const frameScores = tileDifference(baseline, frame, abortSignal);
      for (let index = 0; index < frameScores.length; index++) {
        combinedScores[index] = Math.max(
          combinedScores[index],
          frameScores[index],
        );
      }
    },
    abortSignal,
  );
  const strongest = strongestChangeTiles(
    combinedScores,
    columns,
    rows,
    metadata.width,
    metadata.height,
    baseline.width,
    baseline.height,
    analysisRegion,
  );
  if (!strongest.length) return undefined;

  const frameScores = [0];
  const transitionScores = [0];
  let previous = baseline;
  // Keep only adjacent decoded frames, and rank state boundaries before
  // repeated copies of a large change relative to the baseline.
  for (const screenshot of screenshots.slice(1)) {
    abortSignal?.throwIfAborted();
    const frame = await analysisFrame(
      screenshot,
      analysisRegion,
      dimensions,
      Sharp,
    );
    let changeScore = 0;
    let transitionScore = 0;
    for (const candidate of strongest) {
      const change = localizedDifference(
        baseline,
        frame,
        candidate.analysisRect,
      );
      candidate.changes.push(change);
      changeScore = Math.max(changeScore, change.meanAbsoluteDifference);
      transitionScore = Math.max(
        transitionScore,
        localizedDifference(previous, frame, candidate.analysisRect)
          .meanAbsoluteDifference,
      );
    }
    frameScores.push(changeScore);
    transitionScores.push(transitionScore);
    previous = frame;
  }
  const frameIndices = selectFrameIndices(frameScores, transitionScores);
  const outputWidth = Math.max(strongest[0].rect.width, upscaledFocusWidth);
  const frames = await mapWithConcurrency(
    frameIndices,
    renderConcurrency,
    async (sourceFrameIndex) => {
      const screenshot = screenshots[sourceFrameIndex];
      const source = Sharp(screenshotBuffer(screenshot));
      const crops: (RenderedCrop & { change: ObservationRegionChange })[] = [];
      for (const region of strongest) {
        crops.push({
          ...(await renderOutlinedCrop(
            source,
            region.rect,
            region.measurementRect,
            outputWidth,
            Sharp,
          )),
          change: region.changes[sourceFrameIndex],
        });
      }
      const cropHeight = crops[0].height;
      const gridColumns = Math.min(focusGridColumns, crops.length);
      const gridRows = Math.ceil(crops.length / gridColumns);
      const cellHeight = cropHeight + focusLabelHeight;
      const composites = crops.flatMap(({ buffer, change }, index) => {
        const left = (index % gridColumns) * outputWidth;
        const top = Math.floor(index / gridColumns) * cellHeight;
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
          screenshot.timing,
          screenshot.frameId,
        ),
        sourceFrameIndex,
        role: 'change-regions' as const,
      };
    },
    abortSignal,
  );
  return {
    frames,
    regions: strongest.map(({ rect, measurementRect }) => ({
      rect,
      measurementRect,
    })),
  };
}
