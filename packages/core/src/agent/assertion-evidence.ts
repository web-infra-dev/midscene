import type {
  AssertionBoundary,
  AssertionEvaluationContext,
  AssertionEvidenceImage,
  ExecutionDump,
  ExecutionTask,
  IExecutionDump,
} from '@/types';

export const DEFAULT_AFTER_FRAMES = 1;
export const DEFAULT_FRAME_INTERVAL_MS = 50;
export const DEFAULT_BEFORE_EXECUTIONS = 1;
export const DEFAULT_BEFORE_TASKS = 1;
export const DEFAULT_MAX_PICTURES = 2;

export const ANALYSIS_SECTIONS = [
  '当前界面判断',
  '关联 task 分析',
  '截图证据分析',
  '最终结论',
] as const;

const ACTION_EVIDENCE_PHASE_RE = /(before-calling|after-calling-(\d+))$/;

const STATUS_TEXT: Record<string, string> = {
  finished: '已完成',
  failed: '失败',
  running: '执行中',
  pending: '待执行',
};

export type ActionEvidenceOptions = {
  AfterActPictures: number;
  Interval: number;
};

export type NormalizedAssertEvidenceOptions = {
  deepAssert: boolean;
  AssertionContextBoundary: AssertionBoundary;
  BeforeExecutions: number;
  BeforeTasks: number;
  MaxPictures: number;
};

export type AssertCallArgs = {
  message?: string;
  options?: {
    keepRawResponse?: boolean;
    context?: string;
    abortSignal?: AbortSignal;
    deepAssert?: boolean;
    AssertionContextBoundary?: AssertionBoundary;
    BeforeExecutions?: number;
    BeforeTasks?: number;
    MaxPictures?: number;
    [key: string]: unknown;
  };
};

export function nonNegative(
  value: number | undefined,
  fallback: number,
  integer = true,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return integer ? Math.floor(value) : value;
}

export function normalizeActionEvidenceOptions(options?: {
  AfterActPictures?: number;
  Interval?: number;
}): ActionEvidenceOptions {
  return {
    AfterActPictures: nonNegative(
      options?.AfterActPictures,
      DEFAULT_AFTER_FRAMES,
    ),
    Interval: nonNegative(options?.Interval, DEFAULT_FRAME_INTERVAL_MS),
  };
}

export function normalizeAssertEvidenceOptions(
  options?: Record<string, unknown> | null,
): NormalizedAssertEvidenceOptions {
  const boundary = options?.AssertionContextBoundary;
  return {
    deepAssert: options?.deepAssert !== false,
    AssertionContextBoundary:
      boundary === 'session' || boundary === 'lastAssert'
        ? boundary
        : 'lastAssert',
    BeforeExecutions: nonNegative(
      typeof options?.BeforeExecutions === 'number'
        ? options.BeforeExecutions
        : undefined,
      DEFAULT_BEFORE_EXECUTIONS,
    ),
    BeforeTasks: nonNegative(
      typeof options?.BeforeTasks === 'number' ? options.BeforeTasks : undefined,
      DEFAULT_BEFORE_TASKS,
    ),
    MaxPictures: nonNegative(
      typeof options?.MaxPictures === 'number' ? options.MaxPictures : undefined,
      DEFAULT_MAX_PICTURES,
    ),
  };
}

export function resolveAssertCallArgs(
  message?: string | object,
  options?: AssertCallArgs['options'],
): AssertCallArgs {
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    return {
      options: {
        ...(options || {}),
        ...(message as AssertCallArgs['options']),
      },
    };
  }
  return {
    ...(typeof message === 'string' ? { message } : {}),
    ...(options ? { options } : {}),
  };
}

export function isActionSpaceTask(
  task: Pick<ExecutionTask, 'type'> | undefined,
): boolean {
  return task?.type === 'Action Space';
}

export function isAssertTask(
  task: Pick<ExecutionTask, 'type' | 'subType'> | undefined,
): boolean {
  if (!task) {
    return false;
  }
  if (task.type === 'Assert' || task.type === 'Assertion') {
    return true;
  }
  return task.type === 'Insight' && task.subType === 'Assert';
}

export function isFinalPlanningSummary(
  task: Pick<ExecutionTask, 'type' | 'status' | 'output'> | undefined,
): boolean {
  if (!task || task.type !== 'Planning' || task.status !== 'finished') {
    return false;
  }
  const output = task.output as
    | { shouldContinuePlanning?: boolean; actions?: unknown[] }
    | undefined;
  return output?.shouldContinuePlanning === false && !output?.actions?.length;
}

export function actionEvidencePhase(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const match = ACTION_EVIDENCE_PHASE_RE.exec(value);
  return match?.[1] ?? '';
}

function statusText(status: string | undefined): string {
  if (!status) {
    return '';
  }
  return STATUS_TEXT[status] ?? status;
}

function taskPrompt(task: ExecutionTask): string {
  const param = task.param as Record<string, unknown> | undefined;
  if (typeof param?.assertion === 'string' && param.assertion.trim()) {
    return param.assertion;
  }
  if (typeof param?.thought === 'string' && param.thought.trim()) {
    return param.thought;
  }
  if (typeof task.thought === 'string' && task.thought.trim()) {
    return task.thought;
  }
  if (typeof param?.description === 'string' && param.description.trim()) {
    return param.description;
  }
  const locate = param?.locate as { prompt?: unknown; description?: unknown };
  if (typeof locate?.description === 'string' && locate.description.trim()) {
    return locate.description;
  }
  if (typeof locate?.prompt === 'string' && locate.prompt.trim()) {
    return locate.prompt;
  }
  if (typeof param?.userInstructionDisplay === 'string') {
    return param.userInstructionDisplay;
  }
  if (typeof param?.userInstruction === 'string') {
    return param.userInstruction;
  }
  if (typeof param?.dataDemand === 'string') {
    return param.dataDemand;
  }
  return '';
}

function failureReason(task: ExecutionTask): string | undefined {
  if (typeof task.errorMessage === 'string' && task.errorMessage.trim()) {
    return task.errorMessage;
  }
  const error = task.error as { message?: string } | string | undefined;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
}

export function recentAssertionExecutions(
  allExecutions: Array<ExecutionDump | IExecutionDump>,
  maxExecutions: number,
  boundary: AssertionBoundary,
): Array<ExecutionDump | IExecutionDump> {
  const nonEmpty = allExecutions.filter(
    (item) => Array.isArray(item.tasks) && item.tasks.length > 0,
  );
  let start = 0;
  if (boundary === 'lastAssert') {
    for (let index = nonEmpty.length - 1; index >= 0; index--) {
      if (nonEmpty[index].tasks.some((task) => isAssertTask(task))) {
        start = index + 1;
        break;
      }
    }
  }
  return maxExecutions > 0 ? nonEmpty.slice(start).slice(-maxExecutions) : [];
}

function eligibleTasksFromExecutions(
  executions: Array<ExecutionDump | IExecutionDump>,
): Array<{ execution: ExecutionDump | IExecutionDump; task: ExecutionTask }> {
  const selected: Array<{
    execution: ExecutionDump | IExecutionDump;
    task: ExecutionTask;
  }> = [];
  for (const execution of executions) {
    for (const task of execution.tasks || []) {
      if (task.type === 'Log' || isFinalPlanningSummary(task)) {
        continue;
      }
      selected.push({ execution, task });
    }
  }
  return selected;
}

export function buildEvaluationContext(
  executions: Array<ExecutionDump | IExecutionDump>,
  beforeTasks: number,
): AssertionEvaluationContext {
  const eligible = eligibleTasksFromExecutions(executions);
  const window = beforeTasks > 0 ? eligible.slice(-beforeTasks) : [];
  const contextExecutions = executions.map((execution) => ({
    executionId: execution.id,
    title: execution.name || '',
  }));
  const tasks = window.map(({ execution, task }) => ({
    executionTitle: execution.name || '',
    taskId: task.taskId,
    type: task.type,
    ...(task.subType ? { subType: task.subType } : {}),
    prompt: taskPrompt(task) || '(无描述)',
    status: task.status,
    ...(failureReason(task) ? { failureReason: failureReason(task) } : {}),
  }));

  const summaryParts = contextExecutions.map((item) => item.title).filter(Boolean);
  return {
    summary:
      summaryParts.length > 0
        ? `关联执行：${summaryParts.join('；')}`
        : '无关联执行',
    executions: contextExecutions,
    tasks,
  };
}

function screenshotIdentity(screenshot: {
  id?: string;
  base64?: string;
}): { id?: string; content?: string } {
  return {
    ...(screenshot.id ? { id: screenshot.id } : {}),
    ...(screenshot.base64 ? { content: screenshot.base64 } : {}),
  };
}

export function selectAssertionEvidenceImages(
  executions: Array<ExecutionDump | IExecutionDump>,
  maxPictures: number,
): AssertionEvidenceImage[] {
  if (maxPictures <= 0) {
    return [];
  }

  const candidates: AssertionEvidenceImage[] = [];
  for (const execution of executions) {
    for (const task of execution.tasks || []) {
      if (!isActionSpaceTask(task)) {
        continue;
      }
      for (const record of task.recorder || []) {
        const phase = actionEvidencePhase(record.timing);
        if (!phase) {
          continue;
        }
        const screenshot = record.screenshot;
        const url = screenshot?.base64;
        if (!url) {
          continue;
        }
        const subtype = task.subType || task.type;
        candidates.push({
          name: `${execution.name || ''} / ${subtype} / ${phase}`,
          url,
          ...(typeof screenshot.capturedAt === 'number'
            ? { capturedAt: screenshot.capturedAt }
            : {}),
          ...(screenshot.id ? { id: screenshot.id } : {}),
        } as AssertionEvidenceImage & { id?: string });
      }
    }
  }

  const selected: AssertionEvidenceImage[] = [];
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();

  for (
    let index = candidates.length - 1;
    index >= 0 && selected.length < maxPictures;
    index--
  ) {
    const image = candidates[index] as AssertionEvidenceImage & { id?: string };
    const identity = screenshotIdentity({ id: image.id, base64: image.url });
    if (identity.id && seenIds.has(identity.id)) {
      continue;
    }
    if (identity.content && seenContent.has(identity.content)) {
      continue;
    }
    if (identity.id) {
      seenIds.add(identity.id);
    }
    if (identity.content) {
      seenContent.add(identity.content);
    }
    selected.push({
      name: image.name,
      url: image.url,
      ...(image.capturedAt === undefined
        ? {}
        : { capturedAt: image.capturedAt }),
    });
  }

  return selected;
}

export function citationForContextTask(
  task: AssertionEvaluationContext['tasks'][number],
  index: number,
): string {
  const label = task.subType ? `${task.type}/${task.subType}` : task.type;
  const failure = task.failureReason
    ? `；失败原因：${task.failureReason}`
    : '';
  return `Task ${index}: [${task.executionTitle}] ${label} - ${task.prompt || '(无描述)'} -> ${statusText(task.status)}${failure}`;
}

function analysisSection(thought: string, section: string): string {
  const start = thought.indexOf(section);
  if (start < 0) {
    return '';
  }
  const contentStart = start + section.length;
  const following = ANALYSIS_SECTIONS.map((candidate) =>
    candidate === section ? -1 : thought.indexOf(candidate, contentStart),
  ).filter((index) => index >= 0);
  const end = following.length > 0 ? Math.min(...following) : thought.length;
  return thought.slice(contentStart, end).trim();
}

function stripForbiddenTerms(value: string): string {
  return value
    .replace(/构建响应/g, '')
    .replace(/响应构建/g, '')
    .replace(/DATA_DEMAND/g, '')
    .replace(/StatementIsTruthy/g, '')
    .trim();
}

export function composeAssertThought(input: {
  modelThought?: string;
  assertion: string;
  passed: boolean;
  evaluationContext?: AssertionEvaluationContext;
  evidenceImages?: AssertionEvidenceImage[];
}): string {
  const raw = stripForbiddenTerms(input.modelThought || '');
  const current =
    analysisSection(raw, '当前界面判断') ||
    (raw && !ANALYSIS_SECTIONS.some((section) => raw.includes(section))
      ? raw
      : '');
  const screenshot =
    analysisSection(raw, '截图证据分析') ||
    (input.evidenceImages && input.evidenceImages.length > 0
      ? '对比动作前后界面可见内容，结合断言目标判断状态是否成立。'
      : '当前没有可用的动作前后截图，依据最终界面判断。');
  const conclusion =
    analysisSection(raw, '最终结论') ||
    (input.passed
      ? `断言「${input.assertion}」成立。`
      : `断言「${input.assertion}」不成立。`);

  const tasks = input.evaluationContext?.tasks ?? [];
  const relatedLines =
    tasks.length === 0
      ? ['没有可引用的关联任务。']
      : tasks.flatMap((task, index) => {
          const citation = citationForContextTask(task, index + 1);
          return [
            citation,
            `该任务执行了「${task.prompt || '(无描述)'}」，状态为${statusText(task.status)}，据此影响断言判断。`,
          ];
        });

  return [
    '当前界面判断',
    current ||
      (input.passed
        ? `最终界面满足断言「${input.assertion}」。`
        : `最终界面未满足断言「${input.assertion}」。`),
    '关联 task 分析',
    relatedLines.join('\n'),
    '截图证据分析',
    screenshot,
    '最终结论',
    conclusion,
  ].join('\n');
}

export function deepAssertEvidence(
  task: Pick<ExecutionTask, 'type' | 'subType' | 'param'> | undefined,
): AssertionEvidenceImage[] | undefined {
  if (!task || !isAssertTask(task) || task.param?.deepAssert === false) {
    return undefined;
  }
  const param = task.param as
    | { assertionEvidenceImages?: AssertionEvidenceImage[]; deepAssert?: boolean }
    | undefined;
  if (
    param?.assertionEvidenceImages === undefined &&
    param?.deepAssert !== true
  ) {
    return undefined;
  }
  return param?.assertionEvidenceImages ?? [];
}

export function buildDeepAssertScreenshots(
  task: Pick<ExecutionTask, 'type' | 'subType' | 'param'> | undefined,
):
  | Array<{
      screenshot: string;
      timing: string;
      screenshotTimestamp?: number;
    }>
  | null
  | undefined {
  const evidence = deepAssertEvidence(task);
  if (evidence === undefined) {
    return undefined;
  }
  if (evidence.length === 0) {
    return null;
  }
  return evidence
    .slice()
    .reverse()
    .map((image, index) => ({
      screenshot: image.url,
      timing: `参考图${index + 1} / ${image.name}`,
      ...(image.capturedAt === undefined
        ? {}
        : { screenshotTimestamp: image.capturedAt }),
    }));
}

export function asEvaluationContext(
  value: unknown,
): AssertionEvaluationContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as AssertionEvaluationContext;
  if (
    typeof candidate.summary !== 'string' ||
    !Array.isArray(candidate.executions) ||
    !Array.isArray(candidate.tasks)
  ) {
    return undefined;
  }
  return candidate;
}

export function asEvidenceImages(
  value: unknown,
): AssertionEvidenceImage[] | undefined {
  return Array.isArray(value) ? (value as AssertionEvidenceImage[]) : undefined;
}

export function isCurrentScreenshotFallback(
  task: Pick<ExecutionTask, 'param'> | undefined,
): boolean {
  return task?.param?.assertionEvidenceFallback === 'currentScreenshot';
}

export function buildAssertionEvidenceModelContext(input: {
  assertion: string;
  evaluationContext?: AssertionEvaluationContext;
  evidenceImages: AssertionEvidenceImage[];
}): string {
  const taskLines = (input.evaluationContext?.tasks ?? []).map((task, index) =>
    citationForContextTask(task, index + 1),
  );
  const imageLines = input.evidenceImages.map(
    (image, index) => `图${index + 1}: ${image.name}`,
  );

  return [
    `断言目标：${input.assertion}`,
    input.evaluationContext?.summary
      ? `所选执行摘要：${input.evaluationContext.summary}`
      : '',
    taskLines.length > 0
      ? `所选任务证据：\n${taskLines.join('\n')}`
      : '所选任务证据：无',
    imageLines.length > 0
      ? `具名证据图（与 assertionEvidenceImages 一一对应，最新在前）：\n${imageLines.join('\n')}`
      : '具名证据图：无',
    '判断规则：先看最终是否成功；不要只因为路径或中间动作不同就判失败。只有断言明确要求动态过程时，才用证据链评过程。',
    '请用中文按以下四段作答，且不要出现 DATA_DEMAND、StatementIsTruthy、构建响应、响应构建：当前界面判断；关联 task 分析（逐条引用上述 Task N）；截图证据分析（比较 before-calling 与 after-calling-* 的可见变化，不要罗列图名）；最终结论。',
  ]
    .filter(Boolean)
    .join('\n');
}
