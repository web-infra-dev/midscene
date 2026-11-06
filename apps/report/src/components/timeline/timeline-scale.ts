const NICE_STEP_FACTORS = [1, 2, 3, 5, 10] as const;

export const DEFAULT_TIMELINE_MAX_TIME_MS = 500;
export const DESIRED_GRID_WIDTH_PX = 100;
export const DEFAULT_TIME_STEP_MS = 1000;

export interface TimelineScale {
  pxPerMs: number;
  timeStep: number;
  visibleMaxTime: number;
  leftForTimeOffset: (timeOffset: number) => number;
  timeOffsetForLeft: (left: number) => number;
}

export const formatTimelineTime = (timeMs: number): string => {
  const sign = timeMs < 0 ? '-' : '';
  const milliseconds = Math.round(Math.abs(timeMs));
  if (milliseconds < 2_000) {
    return `${milliseconds ? sign : ''}${milliseconds} ms`;
  }

  const seconds = Math.round(milliseconds / 100) / 10;
  if (seconds < 60) return `${sign}${seconds} s`;

  const totalSeconds = Math.round(milliseconds / 1_000);
  return `${sign}${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
};

export const pickNiceStep = (roughStepMs: number): number => {
  if (!Number.isFinite(roughStepMs) || roughStepMs <= 0) {
    return DEFAULT_TIME_STEP_MS;
  }

  const magnitude = 10 ** Math.floor(Math.log10(roughStepMs));
  const normalized = roughStepMs / magnitude;
  const factor =
    NICE_STEP_FACTORS.find((candidate) => candidate >= normalized) ?? 10;

  // Sub-ms ticks would collapse into duplicate labels such as "0 ms".
  return Math.max(1, factor * magnitude);
};

export const createTimelineScale = ({
  canvasWidth,
  maxTime,
  sizeRatio,
}: {
  canvasWidth: number;
  maxTime: number;
  sizeRatio: number;
}): TimelineScale => {
  const safeCanvasWidth = Math.max(canvasWidth, 1);
  const safeMaxTime = Math.max(maxTime, 1);

  const desiredGridPx = DESIRED_GRID_WIDTH_PX * sizeRatio;
  const roughPxPerMs = safeCanvasWidth / safeMaxTime;
  const roughStepMs = desiredGridPx / roughPxPerMs;
  const timeStep = pickNiceStep(roughStepMs);
  // Timeline thumbnails use x as the image's left edge. If maxTime maps exactly
  // to the canvas right edge, the last thumbnail starts off-canvas. Extend the
  // visible range to the next tick so the ending thumbnail still has room.
  const visibleMaxTime = Math.ceil(safeMaxTime / timeStep) * timeStep;
  const pxPerMs = safeCanvasWidth / visibleMaxTime;

  return {
    pxPerMs,
    timeStep,
    visibleMaxTime,
    leftForTimeOffset: (timeOffset: number) => Math.floor(timeOffset * pxPerMs),
    timeOffsetForLeft: (left: number) => Math.floor(left / pxPerMs),
  };
};
