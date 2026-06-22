import {
  type CliVerboseScreenshotCollectOptions,
  collectScreenshotRefs,
  pathForReportScreenshot,
} from './verbose-screenshot';

export interface CliVerboseLine {
  key: string;
  text: string;
}

export interface CliAiActProgressEvent {
  type?: unknown;
  event?: unknown;
  sequence?: unknown;
  prompt?: unknown;
  planIndex?: unknown;
  planLimit?: unknown;
  screenshot?: unknown;
  message?: unknown;
  action?: unknown;
  durationMs?: unknown;
  error?: unknown;
}

export interface CliAiActProgressPayload
  extends Omit<CliAiActProgressEvent, 'screenshot'> {
  screenshots?: Array<Record<string, unknown>>;
  screenshotPath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactText(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  } catch {
    return String(value);
  }
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function planPrefix(event: CliAiActProgressPayload): string {
  const planIndex = numericValue(event.planIndex);
  if (!planIndex) {
    return '[Midscene][aiAct]';
  }

  const planLimit = numericValue(event.planLimit);
  return `[Midscene][aiAct][Plan ${Math.round(planIndex)}${
    planLimit ? `/${Math.round(planLimit)}` : ''
  }]`;
}

function eventKey(event: CliAiActProgressPayload, suffix: string): string {
  const sequence = numericValue(event.sequence);
  if (sequence) {
    return `aiAct:${sequence}:${suffix}`;
  }

  return [
    'aiAct',
    compactText(event.event),
    compactText(event.planIndex),
    compactText(event.message),
    suffix,
  ]
    .filter(Boolean)
    .join(':');
}

export function normalizeAiActProgressEventForCli(
  event: unknown,
  screenshotOptions: CliVerboseScreenshotCollectOptions = {},
): CliAiActProgressPayload | undefined {
  if (!isRecord(event) || event.type !== 'aiAct') {
    return undefined;
  }

  const screenshots = collectScreenshotRefs(
    event.screenshot,
    screenshotOptions,
  );
  const latestPath = screenshots
    .slice()
    .reverse()
    .find(
      (item) => typeof item.path === 'string' && item.path.length > 0,
    )?.path;
  const screenshotPath =
    typeof latestPath === 'string'
      ? pathForReportScreenshot(latestPath, screenshotOptions.reportFile)
      : undefined;

  const {
    type,
    event: eventName,
    sequence,
    prompt,
    planIndex,
    planLimit,
    message,
    action,
    durationMs,
    error,
  } = event;

  return {
    type,
    event: eventName,
    sequence,
    prompt,
    planIndex,
    planLimit,
    message,
    action,
    durationMs,
    error,
    ...(screenshots.length > 0 ? { screenshots } : {}),
    ...(screenshotPath ? { screenshotPath } : {}),
  };
}

export function buildAiActProgressEventLines(
  event: CliAiActProgressPayload,
): CliVerboseLine[] {
  const eventName = typeof event.event === 'string' ? event.event : '';
  const prefix = planPrefix(event);
  const message = compactText(event.message);
  const error = compactText(event.error);
  const duration =
    typeof event.durationMs === 'number'
      ? ` cost=${Math.round(event.durationMs)}ms`
      : '';

  switch (eventName) {
    case 'start': {
      const prompt = compactText(event.prompt);
      return [
        {
          key: `aiAct:start:${prompt}`,
          text: prompt
            ? `[Midscene][aiAct] Start: ${prompt}`
            : '[Midscene][aiAct] Start',
        },
      ];
    }
    case 'plan_thinking':
      return event.screenshotPath
        ? [
            {
              key: eventKey(event, 'thinking'),
              text: `${prefix} Thinking with the latest screenshot: ${event.screenshotPath}`,
            },
          ]
        : [
            {
              key: eventKey(event, 'thinking'),
              text: `${prefix} Thinking with the latest screenshot`,
            },
          ];
    case 'plan_planned':
      return message
        ? [
            {
              key: eventKey(event, 'planned'),
              text: `${prefix} Planned: ${message}`,
            },
          ]
        : [];
    case 'plan_action':
      return message
        ? [
            {
              key: eventKey(event, 'action'),
              text: `${prefix} Action: ${message}`,
            },
          ]
        : [];
    case 'plan_failed':
      return [
        {
          key: eventKey(event, 'plan_failed'),
          text: `${prefix} Failed${error || message ? `: ${error || message}` : ''}`,
        },
      ];
    case 'action_running':
      return message
        ? [
            {
              key: eventKey(event, 'action_running'),
              text: `[Midscene][aiAct][Action] Running: ${message}`,
            },
          ]
        : [];
    case 'action_done':
      return message
        ? [
            {
              key: eventKey(event, 'action_done'),
              text: `[Midscene][aiAct][Action] Done: ${message}${duration}`,
            },
          ]
        : [];
    case 'action_failed':
      return [
        {
          key: eventKey(event, 'action_failed'),
          text: `[Midscene][aiAct][Action] Failed${message ? `: ${message}` : ''}${duration}${
            error ? ` error=${error}` : ''
          }`,
        },
      ];
    case 'complete':
      return [
        {
          key: eventKey(event, 'complete'),
          text: `[Midscene][aiAct] Complete${message ? `: ${message}` : ''}`,
        },
      ];
    case 'failed':
      return [
        {
          key: eventKey(event, 'failed'),
          text: `[Midscene][aiAct] Failed${error || message ? `: ${error || message}` : ''}`,
        },
      ];
    default:
      return [];
  }
}
