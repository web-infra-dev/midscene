export type MidsceneRecorderEventType =
  | 'click'
  | 'drag'
  | 'scroll'
  | 'input'
  | 'navigation'
  | 'setViewport'
  | 'keydown';

export type MidsceneRecorderSourceKind =
  | 'web-dom'
  | 'studio-preview'
  | 'computer-native'
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
  descriptionLoading?: boolean;
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

export function getMidsceneRecorderEventDescription(
  event: MidsceneRecorderEvent,
) {
  if (event.type === 'navigation' && event.url) {
    return `Navigate to ${event.url}`;
  }
  if (event.elementDescription) {
    return event.elementDescription;
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
  const eventsWithScreenshots = events.filter(
    (event) =>
      event.screenshotBefore ||
      event.screenshotAfter ||
      event.screenshotWithBox,
  );

  const sortedEvents = [...eventsWithScreenshots].sort((left, right) => {
    const rank = (event: MidsceneRecorderEvent) => {
      if (event.type === 'navigation') return 0;
      if (event.type === 'click') return 1;
      if (event.type === 'input') return 2;
      return 3;
    };
    return rank(left) - rank(right);
  });

  const screenshots: string[] = [];
  for (const event of sortedEvents) {
    const screenshot =
      event.screenshotWithBox ||
      event.screenshotAfter ||
      event.screenshotBefore;
    if (screenshot && !screenshots.includes(screenshot)) {
      screenshots.push(screenshot);
      if (screenshots.length >= maxScreenshots) {
        break;
      }
    }
  }
  return screenshots;
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

export function createMidsceneRecorderMarkdownScreenshotAssets(
  events: MidsceneRecorderEvent[],
  options: MidsceneRecorderMarkdownScreenshotOptions = {},
): MidsceneRecorderMarkdownScreenshotAsset[] {
  const baseDir = normalizeMarkdownAssetBaseDir(options.baseDir);
  const maxScreenshots = options.maxScreenshots ?? 8;
  const assets: MidsceneRecorderMarkdownScreenshotAsset[] = [];
  const seenScreenshots = new Set<string>();
  const lastEventIndex = events.length - 1;

  for (let index = 0; index < events.length; index += 1) {
    if (assets.length >= maxScreenshots) {
      break;
    }

    const event = events[index];
    if (!shouldIncludeMarkdownScreenshot(event, index, lastEventIndex)) {
      continue;
    }

    const screenshot = getRecorderEventScreenshot(event);
    if (!screenshot || seenScreenshots.has(screenshot)) {
      continue;
    }

    const parsedScreenshot = parseScreenshotDataUrl(screenshot);
    if (!parsedScreenshot) {
      continue;
    }

    seenScreenshots.add(screenshot);
    const safeType = event.type.replace(/[^a-zA-Z0-9-]/g, '-');
    const fileName = `event-${padEventIndex(index)}-${safeType}.${parsedScreenshot.extension}`;
    assets.push({
      eventIndex: index,
      eventHashId: event.hashId,
      eventType: event.type,
      relativePath: `${baseDir}/${fileName}`,
      dataUrl: parsedScreenshot.dataUrl,
      base64Data: parsedScreenshot.base64Data,
      mimeType: parsedScreenshot.mimeType,
    });
  }

  return assets;
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
