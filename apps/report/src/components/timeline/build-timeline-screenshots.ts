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

const collectScreenshotEntries = (
  allTasks: ExecutionTask[],
): RawScreenshotEntry[] => {
  const entries: RawScreenshotEntry[] = [];

  for (const task of allTasks) {
    const ctxScreenshot = task.uiContext?.screenshot;
    if (ctxScreenshot && task.timing?.start) {
      entries.push({
        task,
        ts: task.timing.start,
        base64: ctxScreenshot.base64 || '',
      });
    }

    for (const recorder of task.recorder ?? []) {
      if (recorder.screenshot) {
        entries.push({
          task,
          ts: recorder.ts,
          base64: recorder.screenshot.base64 || '',
        });
      }
    }
  }

  return entries;
};

// Note: matches the legacy behaviour where any recorder ts (even ones whose
// screenshot was later filtered out) and any task.timing.start contribute to
// the starting time. We keep this so the rendered offsets are unchanged.
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
