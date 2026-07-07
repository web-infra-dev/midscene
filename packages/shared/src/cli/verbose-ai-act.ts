import {
  type CliVerboseScreenshotCollectOptions,
  collectScreenshotRefs,
  pathForReportScreenshot,
} from './verbose-screenshot';

export interface CliVerboseLine {
  key: string;
  text: string;
}

/** Generic progress-bus envelope as seen by the CLI (all fields untrusted). */
export interface CliAgentProgressEvent {
  scope?: unknown;
  phase?: unknown;
  sequence?: unknown;
  data?: unknown;
}

/** Flattened, render-ready aiAct payload derived from the envelope. */
export interface CliAiActProgressPayload {
  phase?: unknown;
  sequence?: unknown;
  prompt?: unknown;
  planIndex?: unknown;
  planLimit?: unknown;
  action?: unknown;
  thought?: unknown;
  log?: unknown;
  output?: unknown;
  durationMs?: unknown;
  error?: unknown;
  screenshots?: Array<Record<string, unknown>>;
  screenshotPath?: string;
  // Lets the payload satisfy the generic `Record<string, unknown>` dispatch
  // boundary while keeping the named fields documented.
  [key: string]: unknown;
}

/** aiAct scope tag on the progress bus (mirrors core's `aiActProgressScope`). */
export const cliAiActProgressScope = 'aiAct';

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

function firstText(values: unknown[]): string {
  for (const value of values) {
    const text = compactText(value);
    if (text) {
      return text;
    }
  }
  return '';
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
    compactText(event.phase),
    compactText(event.planIndex),
    suffix,
  ]
    .filter(Boolean)
    .join(':');
}

// --- Structured action -> human-readable text (presentation lives here) ---

interface ParsedAiActAction {
  name: string;
  target?: string;
  point?: [number, number];
  bbox?: [number, number, number, number];
  param?: unknown;
}

function integerText(value: number): string {
  return String(Math.round(value));
}

function numberTuple2(value: unknown): [number, number] | undefined {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return [value[0], value[1]];
  }
  return undefined;
}

function numberTuple4(
  value: unknown,
): [number, number, number, number] | undefined {
  if (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.slice(0, 4).every((item) => typeof item === 'number')
  ) {
    return [value[0], value[1], value[2], value[3]];
  }
  return undefined;
}

function parseAction(value: unknown): ParsedAiActAction | undefined {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return undefined;
  }
  return {
    name: value.name,
    target: typeof value.target === 'string' ? value.target : undefined,
    point: numberTuple2(value.point),
    bbox: numberTuple4(value.bbox),
    param: value.param,
  };
}

function formatPoint(point: [number, number]): string {
  return `(${integerText(point[0])}, ${integerText(point[1])})`;
}

function formatBbox(bbox: [number, number, number, number]): string {
  return `(${bbox.map(integerText).join(',')})`;
}

function sleepActionText(action: ParsedAiActAction): string | undefined {
  if (action.name !== 'Sleep' || !isRecord(action.param)) {
    return undefined;
  }
  const timeMs =
    numericValue(action.param.timeMs) ??
    numericValue(action.param.duration) ??
    numericValue(action.param.timeoutMs);
  return timeMs !== undefined ? `Sleep ${integerText(timeMs)}ms` : undefined;
}

function plannedActionText(action: ParsedAiActAction): string {
  if (action.point) {
    const targetSegment = action.target ? ` "${action.target}"` : '';
    const bboxSegment = action.bbox ? `, bbox=${formatBbox(action.bbox)}` : '';
    return `${action.name}${targetSegment} at ${formatPoint(action.point)}${bboxSegment}`;
  }

  const sleep = sleepActionText(action);
  if (sleep) {
    return sleep;
  }

  const paramText = compactText(action.param);
  return paramText ? `${action.name}: ${paramText}` : action.name;
}

function runningActionText(action: ParsedAiActAction): string {
  if (action.point) {
    return `${action.name} at ${formatPoint(action.point)}`;
  }
  return plannedActionText(action);
}

export function normalizeAiActProgressEventForCli(
  event: unknown,
  screenshotOptions: CliVerboseScreenshotCollectOptions = {},
): CliAiActProgressPayload | undefined {
  if (!isRecord(event) || event.scope !== cliAiActProgressScope) {
    return undefined;
  }

  const data = isRecord(event.data) ? event.data : {};

  const screenshots = collectScreenshotRefs(data.screenshot, screenshotOptions);
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
    prompt,
    planIndex,
    planLimit,
    action,
    thought,
    log,
    output,
    durationMs,
    error,
  } = data;

  return {
    phase: event.phase,
    sequence: event.sequence,
    prompt,
    planIndex,
    planLimit,
    action,
    thought,
    log,
    output,
    durationMs,
    error,
    ...(screenshots.length > 0 ? { screenshots } : {}),
    ...(screenshotPath ? { screenshotPath } : {}),
  };
}

export function buildAiActProgressEventLines(
  event: CliAiActProgressPayload,
): CliVerboseLine[] {
  const phase = typeof event.phase === 'string' ? event.phase : '';
  const prefix = planPrefix(event);
  const error = compactText(event.error);
  const duration =
    typeof event.durationMs === 'number'
      ? ` cost=${Math.round(event.durationMs)}ms`
      : '';
  const action = parseAction(event.action);

  switch (phase) {
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
    case 'plan_planned': {
      const text = firstText([event.log, event.thought, event.output]);
      return text
        ? [
            {
              key: eventKey(event, 'planned'),
              text: `${prefix} Planned: ${text}`,
            },
          ]
        : [];
    }
    case 'plan_action':
      return action
        ? [
            {
              key: eventKey(event, 'action'),
              text: `${prefix} Action: ${plannedActionText(action)}`,
            },
          ]
        : [];
    case 'plan_failed':
      return [
        {
          key: eventKey(event, 'plan_failed'),
          text: `${prefix} Failed${error ? `: ${error}` : ''}`,
        },
      ];
    case 'action_running':
      return action
        ? [
            {
              key: eventKey(event, 'action_running'),
              text: `[Midscene][aiAct][Action] Running: ${runningActionText(action)}`,
            },
          ]
        : [];
    case 'action_done':
      return action
        ? [
            {
              key: eventKey(event, 'action_done'),
              text: `[Midscene][aiAct][Action] Done: ${action.name}${duration}`,
            },
          ]
        : [];
    case 'action_failed':
      return [
        {
          key: eventKey(event, 'action_failed'),
          text: `[Midscene][aiAct][Action] Failed${
            action ? `: ${action.name}` : ''
          }${duration}${error ? ` error=${error}` : ''}`,
        },
      ];
    case 'complete': {
      const text = firstText([event.output, event.log, event.thought]);
      return [
        {
          key: eventKey(event, 'complete'),
          text: `[Midscene][aiAct] Complete${text ? `: ${text}` : ''}`,
        },
      ];
    }
    case 'failed':
      return [
        {
          key: eventKey(event, 'failed'),
          text: `[Midscene][aiAct] Failed${error ? `: ${error}` : ''}`,
        },
      ];
    default:
      return [];
  }
}

/**
 * A producer-specific renderer for the generic CLI progress dispatcher: turn a
 * raw progress envelope into a normalized payload, then that payload into
 * verbose lines. New producers register their own renderer; the dispatcher core
 * stays untouched.
 */
export interface CliProgressRenderer {
  normalize(
    event: unknown,
    screenshotOptions: CliVerboseScreenshotCollectOptions,
  ): Record<string, unknown> | undefined;
  buildLines(payload: Record<string, unknown>): CliVerboseLine[];
}

export const aiActCliProgressRenderer: CliProgressRenderer = {
  normalize: normalizeAiActProgressEventForCli,
  buildLines: buildAiActProgressEventLines,
};
