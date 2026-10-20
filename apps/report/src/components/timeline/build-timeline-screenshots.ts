import type { ExecutionTask } from '@midscene/core';

export interface TimelineScreenshot {
  id: string;
  img: string;
  timeOffset: number;
}

export interface TimelineBuildResult {
  allScreenshots: TimelineScreenshot[];
  idTaskMap: Record<string, ExecutionTask>;
  startingTime: number;
}

interface RawScreenshotEntry {
  task: ExecutionTask;
  ts: number;
  base64: string;
}

const rawBase64BodyPattern = /^[a-zA-Z0-9+/=\s]+$/;

const imageSrcFromString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (trimmed.length < 32 || !rawBase64BodyPattern.test(trimmed)) {
    return value;
  }

  const body = trimmed.replace(/\s/g, '');
  const mimeType = body.startsWith('/9j/')
    ? 'image/jpeg'
    : body.startsWith('UklGR')
      ? 'image/webp'
      : 'image/png';
  return `data:${mimeType};base64,${body}`;
};

const screenshotBase64 = (screenshot: unknown): string | undefined => {
  if (typeof screenshot === 'string') {
    return imageSrcFromString(screenshot);
  }
  if (
    screenshot &&
    typeof screenshot === 'object' &&
    'base64' in screenshot &&
    typeof screenshot.base64 === 'string'
  ) {
    return imageSrcFromString(screenshot.base64);
  }
  return undefined;
};

const collectScreenshotEntries = (
  allTasks: ExecutionTask[],
): RawScreenshotEntry[] => {
  const entries: RawScreenshotEntry[] = [];

  for (const task of allTasks) {
    const ctxScreenshot = task.uiContext?.screenshot;
    const ctxBase64 = screenshotBase64(ctxScreenshot);
    if (ctxBase64 && task.timing?.start) {
      entries.push({
        task,
        ts: task.timing.start,
        base64: ctxBase64,
      });
    }

    for (const recorder of task.recorder ?? []) {
      const recorderBase64 = screenshotBase64(recorder.screenshot);
      if (recorderBase64) {
        entries.push({
          task,
          ts: recorder.ts,
          base64: recorderBase64,
        });
      }
    }
  }

  return entries;
};

// Note: any recorder ts, even ones whose screenshot is later filtered out, and
// any task.timing.start contribute to the starting time so rendered offsets are
// unchanged.
const computeStartingTime = (allTasks: ExecutionTask[]): number => {
  let starting = -1;
  const consider = (ts: number) => {
    if (starting === -1 || starting > ts) starting = ts;
  };

  for (const task of allTasks) {
    for (const recorder of task.recorder ?? []) {
      consider(recorder.ts);
    }
    if (task.timing?.start) {
      consider(task.timing.start);
    }
  }

  return starting;
};

export const buildTimelineScreenshots = (
  allTasks: ExecutionTask[],
): TimelineBuildResult => {
  const startingTime = computeStartingTime(allTasks);
  const rawEntries = collectScreenshotEntries(allTasks);

  const idTaskMap: Record<string, ExecutionTask> = {};
  const allScreenshots: TimelineScreenshot[] = rawEntries.map((entry, idx) => {
    const id = `id_${idx + 1}`;
    idTaskMap[id] = entry.task;
    return {
      id,
      img: entry.base64,
      timeOffset: entry.ts - startingTime,
    };
  });

  allScreenshots.sort((a, b) => a.timeOffset - b.timeOffset);

  return { allScreenshots, idTaskMap, startingTime };
};
