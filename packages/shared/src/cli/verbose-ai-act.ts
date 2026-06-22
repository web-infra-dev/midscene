import {
  type CliVerboseScreenshotCollectOptions,
  latestScreenshotPathForAiAct,
} from './verbose-screenshot';

interface CliVerboseExecutionTaskLike {
  taskId?: unknown;
  type?: unknown;
  subType?: unknown;
  status?: unknown;
  param?: unknown;
  thought?: unknown;
  output?: unknown;
  errorMessage?: unknown;
  timing?: {
    cost?: unknown;
  };
}

interface CliVerboseExecutionDumpLike {
  tasks: CliVerboseExecutionTaskLike[];
}

export interface CliVerboseLine {
  key: string;
  text: string;
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

function compactCliVerboseValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map(compactCliVerboseValue);
  }

  if (isRecord(value) && typeof value.prompt === 'string') {
    return compactCliVerboseValue(value.prompt);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const entries = Object.entries(value).slice(0, 6);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [
      key,
      compactCliVerboseValue(entryValue),
    ]),
  );
}

function summarizeParam(param: unknown): unknown {
  if (!param || typeof param !== 'object') {
    return compactCliVerboseValue(param);
  }

  const record = param as Record<string, unknown>;
  if (typeof record.prompt === 'string') {
    return compactCliVerboseValue(record.prompt);
  }
  if (
    record.locate &&
    typeof record.locate === 'object' &&
    record.locate !== null
  ) {
    const locate = record.locate as Record<string, unknown>;
    return {
      locate: compactCliVerboseValue(locate.prompt),
      ...Object.fromEntries(
        Object.entries(record)
          .filter(([key]) => key !== 'locate')
          .slice(0, 4)
          .map(([key, value]) => [key, compactCliVerboseValue(value)]),
      ),
    };
  }

  return compactCliVerboseValue(record);
}

function summarizeUserInstruction(value: unknown): string {
  if (typeof value === 'string') {
    return compactText(value);
  }

  if (isRecord(value) && typeof value.prompt === 'string') {
    return compactText(value.prompt);
  }

  return compactText(value);
}

function summarizeSubGoals(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }

  const goals = value
    .slice(0, 6)
    .map((goal) => {
      if (!isRecord(goal)) {
        return '';
      }
      const index = typeof goal.index === 'number' ? `${goal.index}. ` : '';
      const status = typeof goal.status === 'string' ? `[${goal.status}] ` : '';
      const description =
        typeof goal.description === 'string' ? goal.description : '';
      return `${index}${status}${description}`.trim();
    })
    .filter(Boolean);

  return goals.length > 0 ? `sub-goals: ${goals.join('; ')}` : '';
}

function isCliVerboseExecutionDumpLike(
  value: unknown,
): value is CliVerboseExecutionDumpLike {
  return isRecord(value) && Array.isArray(value.tasks);
}

function taskKey(task: CliVerboseExecutionTaskLike, fallback: string): string {
  return typeof task.taskId === 'string' && task.taskId.length > 0
    ? task.taskId
    : fallback;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function integerText(value: number): string {
  return String(Math.round(value));
}

function formatPoint(point: readonly [number, number]): string {
  return `(${integerText(point[0])}, ${integerText(point[1])})`;
}

function formatBbox(bbox: readonly [number, number, number, number]): string {
  return `(${bbox.map(integerText).join(',')})`;
}

function bboxArrayFromProperty(
  value: Record<string, unknown>,
  key: string,
): [number, number, number, number] | undefined {
  const bbox = value[key];
  if (!Array.isArray(bbox) || bbox.length < 4) {
    return undefined;
  }

  const left = numberFromUnknown(bbox[0]);
  const top = numberFromUnknown(bbox[1]);
  const right = numberFromUnknown(bbox[2]);
  const bottom = numberFromUnknown(bbox[3]);
  if (
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined
  ) {
    return undefined;
  }

  return [left, top, right, bottom];
}

function centerPointFromBbox(
  bbox: readonly [number, number, number, number],
): [number, number] {
  return [
    Math.floor((bbox[0] + bbox[2]) / 2),
    Math.floor((bbox[1] + bbox[3]) / 2),
  ];
}

function planLimitText(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.param)) {
    return '';
  }
  const limit = numberFromUnknown(task.param.replanningCycleLimit);
  return limit && limit > 0 ? `/${integerText(limit)}` : '';
}

function planPrefix(
  task: CliVerboseExecutionTaskLike,
  planIndex: number,
): string {
  return `[Midscene][aiAct][Plan ${planIndex}${planLimitText(task)}]`;
}

function actionOutputText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }

  const action = value.find(isRecord);
  if (!action) {
    return '';
  }

  return (
    compactText(action.log) ||
    compactText(action.thought) ||
    compactText(summarizeParam(action.param))
  );
}

function plannedTextForAiAct(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.output)) {
    return compactText(task.output) || compactText(task.thought);
  }

  return (
    compactText(task.output.log) ||
    compactText(task.output.thought) ||
    compactText(task.thought) ||
    summarizeSubGoals(task.output.updateSubGoals) ||
    actionOutputText(task.output.actions) ||
    compactText(task.output.output)
  );
}

function completeTextForAiAct(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.output)) {
    return '';
  }

  const output = compactText(task.output.output);
  if (output) {
    return output;
  }

  return task.output.shouldContinuePlanning === false
    ? plannedTextForAiAct(task)
    : '';
}

function failedTextForAiAct(task: CliVerboseExecutionTaskLike): string {
  if (typeof task.errorMessage === 'string' && task.errorMessage.length > 0) {
    return compactText(task.errorMessage);
  }

  if (isRecord(task.output)) {
    return (
      compactText(task.output.output) ||
      compactText(task.output.log) ||
      compactText(task.output.thought)
    );
  }

  return compactText(task.thought) || 'planning failed';
}

function pointFromLocateLike(
  value: Record<string, unknown>,
): [number, number] | undefined {
  const center = value.center;
  if (Array.isArray(center) && center.length >= 2) {
    const x = numberFromUnknown(center[0]);
    const y = numberFromUnknown(center[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const point = value.point;
  if (Array.isArray(point) && point.length >= 2) {
    const x = numberFromUnknown(point[0]);
    const y = numberFromUnknown(point[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return centerPointFromBbox(locatedPixelBbox);
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return centerPointFromBbox(bbox);
  }

  return undefined;
}

function bboxFromLocateLike(
  value: Record<string, unknown>,
): [number, number, number, number] | undefined {
  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return locatedPixelBbox;
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return bbox;
  }

  if (!isRecord(value.rect)) {
    return undefined;
  }

  const left = numberFromUnknown(value.rect.left);
  const top = numberFromUnknown(value.rect.top);
  const width = numberFromUnknown(value.rect.width);
  const height = numberFromUnknown(value.rect.height);
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }

  return [left, top, left + width, top + height];
}

function targetTextFromLocateLike(value: Record<string, unknown>): string {
  return (
    compactText(value.description) ||
    compactText(value.prompt) ||
    summarizeUserInstruction(value)
  );
}

function isLocateLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    'center' in value ||
    'rect' in value ||
    'point' in value ||
    'bbox' in value ||
    'prompt' in value ||
    'description' in value
  );
}

const locatorParamKeys = ['locate', 'from', 'to', 'start', 'end'];

function firstLocateLikeParam(
  param: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(param)) {
    return undefined;
  }

  for (const key of locatorParamKeys) {
    const value = param[key];
    if (isLocateLike(value)) {
      return value;
    }
  }

  return Object.values(param).find(isLocateLike);
}

function hasUnresolvedLocateLikeParam(param: unknown): boolean {
  if (!isRecord(param)) {
    return false;
  }

  return Object.entries(param).some(([key, value]) => {
    if (locatorParamKeys.includes(key) && typeof value === 'string') {
      return true;
    }

    return (
      isLocateLike(value) &&
      !pointFromLocateLike(value) &&
      !bboxFromLocateLike(value)
    );
  });
}

interface AiActActionText {
  action: string;
  running: string;
  done: string;
}

function sleepActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  if (actionName !== 'Sleep' || !isRecord(param)) {
    return undefined;
  }

  const timeMs =
    numberFromUnknown(param.timeMs) ??
    numberFromUnknown(param.duration) ??
    numberFromUnknown(param.timeoutMs);
  const action = timeMs ? `Sleep ${integerText(timeMs)}ms` : 'Sleep';
  return {
    action,
    running: action,
    done: 'Sleep',
  };
}

function locateActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  const locate = firstLocateLikeParam(param);
  if (!locate) {
    return undefined;
  }

  const point = pointFromLocateLike(locate);
  const bbox = bboxFromLocateLike(locate);
  if (!point) {
    return undefined;
  }

  const target = targetTextFromLocateLike(locate);
  const targetSegment = target ? ` "${target}"` : '';
  const pointSegment = ` at ${formatPoint(point)}`;
  const bboxSegment = bbox ? `, bbox=${formatBbox(bbox)}` : '';
  return {
    action: `${actionName}${targetSegment}${pointSegment}${bboxSegment}`,
    running: `${actionName} at ${formatPoint(point)}`,
    done: actionName,
  };
}

function genericActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  if (hasUnresolvedLocateLikeParam(param)) {
    return undefined;
  }

  const paramText = compactText(summarizeParam(param));
  const action = paramText ? `${actionName}: ${paramText}` : actionName;
  return {
    action,
    running: action,
    done: actionName,
  };
}

function actionTextForAiAct(
  task: CliVerboseExecutionTaskLike,
): AiActActionText | undefined {
  const actionName =
    typeof task.subType === 'string' && task.subType.length > 0
      ? task.subType
      : 'Action';
  return (
    sleepActionText(actionName, task.param) ||
    locateActionText(actionName, task.param) ||
    genericActionText(actionName, task.param)
  );
}

export function buildAiActTimelineLines(
  executionDump: unknown,
  screenshotOptions: CliVerboseScreenshotCollectOptions = {},
): CliVerboseLine[] {
  if (!isCliVerboseExecutionDumpLike(executionDump)) {
    return [];
  }

  const lines: CliVerboseLine[] = [];
  let planIndex = 0;
  let currentPlan:
    | {
        index: number;
        prefix: string;
      }
    | undefined;

  executionDump.tasks.forEach((task, taskIndex) => {
    const fallbackKey = String(taskIndex + 1);
    if (task.type === 'Planning' && task.subType === 'Plan') {
      planIndex += 1;
      currentPlan = {
        index: planIndex,
        prefix: planPrefix(task, planIndex),
      };
      const keyPrefix = `aiAct:plan:${taskKey(task, fallbackKey)}`;
      const screenshotPath = latestScreenshotPathForAiAct(
        task,
        screenshotOptions,
      );
      if (screenshotPath) {
        lines.push({
          key: `${keyPrefix}:thinking`,
          text: `${currentPlan.prefix} Thinking with the latest screenshot: ${screenshotPath}`,
        });
      }

      if (task.status === 'finished') {
        const plannedText = plannedTextForAiAct(task);
        if (plannedText) {
          lines.push({
            key: `${keyPrefix}:planned`,
            text: `${currentPlan.prefix} Planned: ${plannedText}`,
          });
        }

        const completeText = completeTextForAiAct(task);
        if (completeText) {
          lines.push({
            key: `${keyPrefix}:complete`,
            text: `[Midscene][aiAct] Complete: ${completeText}`,
          });
        }
      }

      if (task.status === 'failed') {
        lines.push({
          key: `${keyPrefix}:failed`,
          text: `${currentPlan.prefix} Failed: ${failedTextForAiAct(task)}`,
        });
      }
      return;
    }

    if (
      !currentPlan ||
      task.type !== 'Action Space' ||
      task.subType === 'Finished'
    ) {
      return;
    }

    const actionText = actionTextForAiAct(task);
    if (!actionText) {
      return;
    }

    const keyPrefix = `aiAct:action:${taskKey(task, fallbackKey)}`;
    lines.push({
      key: `${keyPrefix}:planned`,
      text: `${currentPlan.prefix} Action: ${actionText.action}`,
    });

    if (task.status === 'running') {
      lines.push({
        key: `${keyPrefix}:running`,
        text: `[Midscene][aiAct][Action] Running: ${actionText.running}`,
      });
    }

    if (task.status === 'finished') {
      const cost =
        typeof task.timing?.cost === 'number'
          ? ` cost=${integerText(task.timing.cost)}ms`
          : '';
      lines.push({
        key: `${keyPrefix}:finished`,
        text: `[Midscene][aiAct][Action] Done: ${actionText.done}${cost}`,
      });
    }

    if (task.status === 'failed') {
      const cost =
        typeof task.timing?.cost === 'number'
          ? ` cost=${integerText(task.timing.cost)}ms`
          : '';
      const error =
        typeof task.errorMessage === 'string' && task.errorMessage.length > 0
          ? ` error=${task.errorMessage}`
          : '';
      lines.push({
        key: `${keyPrefix}:failed`,
        text: `[Midscene][aiAct][Action] Failed: ${actionText.done}${cost}${error}`,
      });
    }
  });

  return lines;
}
