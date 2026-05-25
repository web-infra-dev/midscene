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
  yaml?: string;
  playwright?: string;
  updatedAt?: number;
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
