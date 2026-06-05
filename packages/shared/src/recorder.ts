export type MidsceneRecorderEventType =
  | 'click'
  | 'drag'
  | 'scroll'
  | 'input'
  | 'navigation'
  | 'setViewport'
  | 'keydown';

export type MidsceneRecorderSourceKind =
  | 'studio-preview'
  | 'unsupported'
  | (string & {});

export type MidsceneRecorderPlatformId =
  | 'web'
  | 'android'
  | 'ios'
  | 'computer'
  | 'harmony'
  | (string & {});

export interface MidsceneRecorderElementRect {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface MidsceneRecorderPageInfo {
  width: number;
  height: number;
}

export interface MidsceneRecorderEvent {
  type: MidsceneRecorderEventType;
  source?: MidsceneRecorderSourceKind;
  actionType?: string;
  rawPayload?: Record<string, unknown>;
  url?: string;
  title?: string;
  value?: string;
  elementRect?: MidsceneRecorderElementRect;
  pageInfo: MidsceneRecorderPageInfo;
  screenshotBefore?: string;
  screenshotAfter?: string;
  elementDescription?: string;
  replayInstruction?: string;
  actionSummary?: string;
  semanticConfidence?: 'high' | 'medium' | 'low';
  descriptionLoading?: boolean;
  descriptionSource?: 'ai' | 'fallback';
  descriptionError?: string;
  screenshotWithBox?: string;
  timestamp: number;
  hashId: string;
}

export interface MidsceneRecorderTarget {
  platformId: MidsceneRecorderPlatformId;
  deviceId?: string;
  label?: string;
  values: Record<string, string | number | boolean>;
}

export interface MidsceneRecorderGeneratedCode {
  markdown?: string;
  yaml?: string;
  playwright?: string;
  updatedAt?: number;
}

export interface MidsceneRecorderMarkdownScreenshotAsset {
  eventIndex: number;
  eventHashId: string;
  eventType: MidsceneRecorderEventType;
  relativePath: string;
  dataUrl: string;
  base64Data: string;
  mimeType: string;
}

export interface MidsceneRecorderMarkdownScreenshotOptions {
  baseDir?: string;
  maxScreenshots?: number;
}

export const DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS = 20;

function isMidsceneRecorderPendingDescription(value?: string) {
  return value?.trim() === 'AI is analyzing element...';
}

export function getMidsceneRecorderEventDescription(
  event: MidsceneRecorderEvent,
) {
  if (
    event.actionSummary &&
    !isMidsceneRecorderPendingDescription(event.actionSummary)
  ) {
    return event.actionSummary;
  }
  if (
    event.elementDescription &&
    !isMidsceneRecorderPendingDescription(event.elementDescription)
  ) {
    return event.elementDescription;
  }
  if (
    event.replayInstruction &&
    !isMidsceneRecorderPendingDescription(event.replayInstruction)
  ) {
    return event.replayInstruction;
  }
  if (event.type === 'navigation' && event.url) {
    return `Navigate to ${event.url}`;
  }
  if (event.value) {
    return event.actionType
      ? `${event.actionType} ${event.value}`
      : event.value;
  }
  if (
    event.elementRect?.x !== undefined &&
    event.elementRect?.y !== undefined
  ) {
    const prefix = event.actionType || event.type;
    return `${prefix} (${Math.round(event.elementRect.x)}, ${Math.round(
      event.elementRect.y,
    )})`;
  }
  return event.actionType || event.type;
}

export function getMidsceneRecorderScreenshotsForLLM(
  events: MidsceneRecorderEvent[],
  maxScreenshots = 1,
) {
  return selectRecorderScreenshotCandidates(
    getRecorderScreenshotCandidates(events),
    maxScreenshots,
  ).map((candidate) => candidate.screenshot);
}

export function sanitizeMidsceneRecorderFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'midscene-recording'
  );
}

function normalizeMarkdownAssetBaseDir(baseDir?: string) {
  const value = (baseDir || './screenshots').replace(/\/+$/g, '');
  if (value.startsWith('./') || value.startsWith('../')) {
    return value;
  }
  return `./${value}`;
}

function padEventIndex(index: number) {
  return String(index + 1).padStart(3, '0');
}

function parseScreenshotDataUrl(value: string):
  | {
      dataUrl: string;
      base64Data: string;
      mimeType: string;
      extension: string;
    }
  | undefined {
  const dataUrlMatch = value.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const extension = mimeType.includes('jpeg')
      ? 'jpg'
      : mimeType.split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'png';
    return {
      dataUrl: value,
      base64Data: dataUrlMatch[2],
      mimeType,
      extension,
    };
  }

  if (/^[a-zA-Z0-9+/=\s]+$/.test(value) && value.trim().length > 0) {
    const base64Data = value.replace(/\s+/g, '');
    return {
      dataUrl: `data:image/png;base64,${base64Data}`,
      base64Data,
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  return undefined;
}

function getRecorderEventScreenshot(event: MidsceneRecorderEvent) {
  return (
    event.screenshotWithBox || event.screenshotAfter || event.screenshotBefore
  );
}

function hasCoordinateFallback(event: MidsceneRecorderEvent) {
  return (
    !event.elementDescription &&
    event.elementRect?.x !== undefined &&
    event.elementRect?.y !== undefined
  );
}

function shouldIncludeMarkdownScreenshot(
  event: MidsceneRecorderEvent,
  eventIndex: number,
  lastEventIndex: number,
) {
  return (
    eventIndex === 0 ||
    eventIndex === lastEventIndex ||
    event.type === 'navigation' ||
    event.type === 'scroll' ||
    event.type === 'input' ||
    Boolean(event.screenshotWithBox) ||
    !event.elementDescription ||
    hasCoordinateFallback(event)
  );
}

interface RecorderScreenshotCandidate {
  event: MidsceneRecorderEvent;
  eventIndex: number;
  screenshot: string;
}

function getRecorderScreenshotCandidatePriority(
  candidate: RecorderScreenshotCandidate,
  firstEventIndex: number,
  lastEventIndex: number,
) {
  const event = candidate.event;
  let priority = 0;

  if (candidate.eventIndex === firstEventIndex) {
    priority += 100;
  }
  if (candidate.eventIndex === lastEventIndex) {
    priority += 95;
  }
  if (event.type === 'navigation') {
    priority += 80;
  }
  if (event.screenshotWithBox) {
    priority += 70;
  }
  if (
    event.descriptionSource === 'fallback' ||
    event.semanticConfidence === 'low' ||
    event.descriptionError
  ) {
    priority += 60;
  }
  if (event.type === 'input' || event.type === 'scroll') {
    priority += 40;
  }
  if (!event.elementDescription || hasCoordinateFallback(event)) {
    priority += 30;
  }

  return priority;
}

function selectEvenlyDistributedCandidates<
  T extends RecorderScreenshotCandidate,
>(candidates: T[], count: number) {
  if (count <= 0) {
    return [];
  }
  if (candidates.length <= count) {
    return candidates;
  }
  if (count === 1) {
    return [candidates[Math.floor((candidates.length - 1) / 2)]];
  }

  return Array.from({ length: count }, (_, index) => {
    const candidateIndex = Math.round(
      (index * (candidates.length - 1)) / (count - 1),
    );
    return candidates[candidateIndex];
  });
}

function selectRecorderScreenshotCandidates<
  T extends RecorderScreenshotCandidate,
>(candidates: T[], maxScreenshots: number): T[] {
  if (maxScreenshots <= 0 || candidates.length === 0) {
    return [];
  }
  if (candidates.length <= maxScreenshots) {
    return candidates;
  }

  const selected = new Map<number, T>();
  const firstEventIndex = candidates[0].eventIndex;
  const lastEventIndex = candidates[candidates.length - 1].eventIndex;
  const addCandidate = (candidate: T | undefined) => {
    if (!candidate || selected.size >= maxScreenshots) {
      return;
    }
    selected.set(candidate.eventIndex, candidate);
  };
  const addEvenly = (pool: T[]) => {
    const remaining = maxScreenshots - selected.size;
    if (remaining <= 0) {
      return;
    }
    const unselected = pool.filter(
      (candidate) => !selected.has(candidate.eventIndex),
    );
    for (const candidate of selectEvenlyDistributedCandidates(
      unselected,
      remaining,
    )) {
      addCandidate(candidate);
    }
  };

  addCandidate(candidates[0]);
  addCandidate(candidates[candidates.length - 1]);

  addEvenly(
    candidates.filter(
      (candidate) =>
        getRecorderScreenshotCandidatePriority(
          candidate,
          firstEventIndex,
          lastEventIndex,
        ) >= 60,
    ),
  );
  addEvenly(
    candidates.filter(
      (candidate) =>
        getRecorderScreenshotCandidatePriority(
          candidate,
          firstEventIndex,
          lastEventIndex,
        ) >= 40,
    ),
  );
  addEvenly(candidates);

  return Array.from(selected.values()).sort(
    (left, right) => left.eventIndex - right.eventIndex,
  );
}

function getRecorderScreenshotCandidates(
  events: MidsceneRecorderEvent[],
): RecorderScreenshotCandidate[] {
  const candidates: RecorderScreenshotCandidate[] = [];
  const seenScreenshots = new Set<string>();
  const lastEventIndex = events.length - 1;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    if (!shouldIncludeMarkdownScreenshot(event, eventIndex, lastEventIndex)) {
      continue;
    }

    const screenshot = getRecorderEventScreenshot(event);
    if (!screenshot || seenScreenshots.has(screenshot)) {
      continue;
    }

    seenScreenshots.add(screenshot);
    candidates.push({
      event,
      eventIndex,
      screenshot,
    });
  }

  return candidates;
}

export function createMidsceneRecorderMarkdownScreenshotAssets(
  events: MidsceneRecorderEvent[],
  options: MidsceneRecorderMarkdownScreenshotOptions = {},
): MidsceneRecorderMarkdownScreenshotAsset[] {
  const baseDir = normalizeMarkdownAssetBaseDir(options.baseDir);
  const maxScreenshots =
    options.maxScreenshots ??
    DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS;
  const candidates: Array<
    RecorderScreenshotCandidate & {
      parsedScreenshot: NonNullable<ReturnType<typeof parseScreenshotDataUrl>>;
    }
  > = [];

  for (const candidate of getRecorderScreenshotCandidates(events)) {
    const parsedScreenshot = parseScreenshotDataUrl(candidate.screenshot);
    if (parsedScreenshot) {
      candidates.push({
        ...candidate,
        parsedScreenshot,
      });
    }
  }

  return selectRecorderScreenshotCandidates(candidates, maxScreenshots).map(
    ({ event, eventIndex, parsedScreenshot }) => {
      const safeType = event.type.replace(/[^a-zA-Z0-9-]/g, '-');
      const fileName = `event-${padEventIndex(eventIndex)}-${safeType}.${parsedScreenshot.extension}`;
      return {
        eventIndex,
        eventHashId: event.hashId,
        eventType: event.type,
        relativePath: `${baseDir}/${fileName}`,
        dataUrl: parsedScreenshot.dataUrl,
        base64Data: parsedScreenshot.base64Data,
        mimeType: parsedScreenshot.mimeType,
      };
    },
  );
}

function scalarToYaml(value: string | number | boolean) {
  return JSON.stringify(value);
}

export function stringifyMidsceneRecorderTargetBlock(
  target: MidsceneRecorderTarget,
) {
  const lines = [`${target.platformId}:`];
  const values = Object.entries(target.values);
  if (values.length === 0) {
    lines.push('  {}');
    return lines.join('\n');
  }
  for (const [key, value] of values) {
    lines.push(`  ${key}: ${scalarToYaml(value)}`);
  }
  return lines.join('\n');
}
