import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { JSON_SCHEMA, dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { globSync } from 'tinyglobby';
import {
  aiActInputSchema,
  aiAssertInputSchema,
  recordToReportInputSchema,
  waitInputSchema,
} from '../midscene';

type UnknownRecord = Record<string, unknown>;

export interface LegacyYamlMigrationOptions {
  source: string;
  outputDir: string;
}

export interface LegacyYamlMigrationResult {
  source: string;
  outputDir: string;
  configPath: string;
  reportPath: string;
  workflowPaths: readonly string[];
  warnings: readonly string[];
}

interface LoadedYamlDocument {
  path: string;
  value: UnknownRecord;
}

interface LegacyBatchOptions {
  sourcePath?: string;
  target?: LegacyWebTargetSource;
  concurrent: number;
  continueOnError: boolean;
  retry: number;
  headed: boolean;
  warnings: string[];
}

interface LegacyWebTargetSource {
  source: 'page' | 'browser' | 'web' | 'target';
  mode: 'page' | 'browser';
  value: UnknownRecord;
}

interface NormalizedWebTarget {
  url: string;
  mode: 'page' | 'browser';
  headless: boolean;
  userAgent: string;
  acceptInsecureCerts: boolean;
  viewportWidth: number;
  viewportHeight: number;
  waitForNetworkIdleTimeout: number;
  continueOnNetworkIdleError: boolean;
  deviceScaleFactor?: number;
  extraHTTPHeaders?: Record<string, string>;
  forceSameTabNavigation?: boolean;
  autoFollowNewPage?: boolean;
  chromeArgs?: string[];
}

interface PreparedWorkflow {
  sourcePath: string;
  sourceDisplayPath: string;
  projectName: string;
  workflowFile: string;
  environmentBridges: LegacyEnvironmentBridge[];
  target: NormalizedWebTarget;
  agentOptions: UnknownRecord;
  retry: number;
  document: {
    cases: Array<{
      name: string;
      steps: UnknownRecord[];
    }>;
  };
}

interface LegacyEnvironmentBridge {
  alias: string;
  name: string;
  fallback: string;
}

interface PreparedMigration {
  source: string;
  sourceRoot: string;
  batch: LegacyBatchOptions;
  scripts: LoadedYamlDocument[];
  warnings: string[];
}

const YAML_PATTERNS = ['**/*.yaml', '**/*.yml'];
const LEGACY_WEB_TARGET_KEYS = ['page', 'browser', 'web', 'target'] as const;
const LEGACY_NON_WEB_TARGET_KEYS = [
  'android',
  'ios',
  'harmony',
  'computer',
  'interface',
] as const;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPosix = (value: string): string => value.split(sep).join('/');

const sourceLabel = (sourceRoot: string, path: string): string => {
  const fromRoot = toPosix(relative(sourceRoot, path));
  return fromRoot && !fromRoot.startsWith('../') ? fromRoot : path;
};

const fail = (path: string, location: string, message: string): never => {
  const suffix = location ? ` (${location})` : '';
  throw new Error(`${path}${suffix}: ${message}`);
};

const parseYamlDocument = (path: string): LoadedYamlDocument => {
  let value: unknown;
  try {
    value = loadYaml(readFileSync(path, 'utf8'), { schema: JSON_SCHEMA });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: failed to parse legacy YAML: ${message}`);
  }
  if (!isRecord(value)) {
    throw new Error(`${path}: legacy YAML must contain a top-level mapping.`);
  }
  return { path, value };
};

const validateBoolean = (
  value: unknown,
  path: string,
  location: string,
  fallback: boolean,
): boolean => {
  if (value === undefined) return fallback;
  rejectTypedEnvironmentReference(value, path, location);
  if (typeof value !== 'boolean') {
    return fail(path, location, 'must be a boolean.');
  }
  return value;
};

const validateNonNegativeInteger = (
  value: unknown,
  path: string,
  location: string,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  rejectTypedEnvironmentReference(value, path, location);
  if (!Number.isInteger(value) || (value as number) < 0) {
    return fail(path, location, 'must be a non-negative integer.');
  }
  return value as number;
};

const validatePositiveInteger = (
  value: unknown,
  path: string,
  location: string,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  rejectTypedEnvironmentReference(value, path, location);
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) <= 0) {
    return fail(path, location, 'must be a positive integer.');
  }
  return parsed as number;
};

const validateOptionalString = (
  value: unknown,
  path: string,
  location: string,
): void => {
  if (value !== undefined && typeof value !== 'string') {
    fail(path, location, 'must be a string.');
  }
};

const hasEnvironmentReference = (value: unknown): value is string =>
  typeof value === 'string' && /\$\{[^}]+\}/.test(value);

const rejectTypedEnvironmentReference = (
  value: unknown,
  path: string,
  location: string,
): void => {
  if (hasEnvironmentReference(value)) {
    fail(
      path,
      location,
      'environment variables in typed fields cannot be migrated losslessly because legacy YAML interpolates before scalar parsing; replace the reference with a concrete boolean or number in a migration copy.',
    );
  }
};

const resolveMigrationEnvironmentReferences = (
  value: string,
  path: string,
  location: string,
): string =>
  value.replace(/\$\{([^}]*)\}/g, (match, rawName: string) => {
    if (!rawName) return match;
    const name = rawName.trim();
    const resolved = process.env[name];
    if (resolved === undefined) {
      return fail(
        path,
        location,
        `environment variable "${name}" is required to expand the legacy batch file pattern during migration.`,
      );
    }
    return resolved;
  });

const getLegacyWebTarget = (
  document: UnknownRecord,
  path: string,
): LegacyWebTargetSource | undefined => {
  const nonWebTargets = LEGACY_NON_WEB_TARGET_KEYS.filter(
    (key) => document[key] !== undefined,
  );
  if (nonWebTargets.length > 0) {
    fail(
      path,
      nonWebTargets[0],
      `the migration command currently supports Web YAML only; migrate ${nonWebTargets[0]} setup manually.`,
    );
  }
  if (document.config !== undefined) {
    fail(
      path,
      'config',
      'generic legacy config targets cannot be converted to a Web Test Runner project.',
    );
  }

  const candidates = LEGACY_WEB_TARGET_KEYS.filter(
    (key) => document[key] !== undefined,
  );
  if (candidates.length > 1) {
    fail(
      path,
      '',
      `only one legacy Web target is allowed, but found: ${candidates.join(', ')}.`,
    );
  }
  if (candidates.length === 0) return undefined;

  const source = candidates[0];
  const rawTarget = document[source];
  if (!isRecord(rawTarget)) {
    return fail(path, source, 'must be a mapping.');
  }
  const explicitMode = rawTarget.mode;
  if (hasEnvironmentReference(explicitMode)) {
    fail(
      path,
      `${source}.mode`,
      'an environment-driven target mode cannot be selected safely during migration; replace it with page or browser in a migration copy.',
    );
  }
  if (
    explicitMode !== undefined &&
    explicitMode !== 'page' &&
    explicitMode !== 'browser'
  ) {
    fail(path, `${source}.mode`, 'must be either "page" or "browser".');
  }
  if (source === 'page' && explicitMode === 'browser') {
    fail(path, `${source}.mode`, 'page targets cannot use browser mode.');
  }
  if (source === 'browser' && explicitMode === 'page') {
    fail(path, `${source}.mode`, 'browser targets cannot use page mode.');
  }
  const mode: 'page' | 'browser' =
    source === 'page' || (source !== 'browser' && explicitMode !== 'browser')
      ? 'page'
      : 'browser';
  return { source, mode, value: rawTarget };
};

const mergeRecords = (
  base: UnknownRecord,
  override: UnknownRecord,
): UnknownRecord => {
  const result: UnknownRecord = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(result[key]) && isRecord(value)) {
      result[key] = mergeRecords(result[key] as UnknownRecord, value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
};

const normalizeBatch = (
  batchDocument: LoadedYamlDocument | undefined,
): LegacyBatchOptions => {
  if (!batchDocument) {
    return {
      concurrent: 1,
      continueOnError: false,
      retry: 0,
      headed: false,
      warnings: [],
    };
  }
  const { path, value } = batchDocument;
  if (!Array.isArray(value.files)) {
    fail(path, 'files', 'must be an array of YAML paths or glob patterns.');
  }
  ensureOnlyKeys(
    value,
    [
      'files',
      'setup',
      'concurrent',
      'continueOnError',
      'retry',
      'summary',
      'shareBrowserContext',
      'page',
      'browser',
      'web',
      'target',
      'android',
      'ios',
      'headed',
      'keepWindow',
      'dotenvOverride',
      'dotenvDebug',
    ],
    path,
    'batch',
  );
  if (value.setup !== undefined) {
    fail(
      path,
      'setup',
      'setup YAML has no automatic lifecycle conversion; remove it from a migration copy, then re-create it with defineProjectSetup or a guarded custom Node in the generated project.',
    );
  }
  const shareBrowserContext = validateBoolean(
    value.shareBrowserContext,
    path,
    'shareBrowserContext',
    false,
  );
  if (shareBrowserContext) {
    fail(
      path,
      'shareBrowserContext',
      'shared browser state cannot be preserved when each legacy file becomes an isolated Test Runner project.',
    );
  }
  const keepWindow = validateBoolean(
    value.keepWindow,
    path,
    'keepWindow',
    false,
  );
  if (keepWindow) {
    fail(
      path,
      'keepWindow',
      'keepWindow has no non-leaking Test Runner teardown equivalent; remove it before migration.',
    );
  }
  const dotenvOverride = validateBoolean(
    value.dotenvOverride,
    path,
    'dotenvOverride',
    false,
  );
  const dotenvDebug = validateBoolean(
    value.dotenvDebug,
    path,
    'dotenvDebug',
    false,
  );

  const warnings: string[] = [];
  if (value.summary !== undefined) {
    warnings.push(
      `${path}: legacy summary output is replaced by .midscene/test-results/<runId>/summary.json.`,
    );
  }
  if (dotenvOverride || dotenvDebug) {
    warnings.push(
      `${path}: the new runner does not load legacy dotenv options; export required environment variables before running.`,
    );
  }

  return {
    sourcePath: path,
    target: getLegacyWebTarget(value, path),
    concurrent: validatePositiveInteger(
      value.concurrent,
      path,
      'concurrent',
      1,
    ),
    continueOnError: validateBoolean(
      value.continueOnError,
      path,
      'continueOnError',
      false,
    ),
    retry: validateNonNegativeInteger(value.retry, path, 'retry', 0),
    headed: validateBoolean(value.headed, path, 'headed', false),
    warnings,
  };
};

const expandBatchFiles = (document: LoadedYamlDocument): string[] => {
  const patterns = document.value.files;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return fail(document.path, 'files', 'must be a non-empty array.');
  }
  const root = dirname(document.path);
  const expanded: string[] = [];
  for (const [index, pattern] of patterns.entries()) {
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      fail(document.path, `files[${index}]`, 'must be a non-empty string.');
    }
    const expandedPattern = resolveMigrationEnvironmentReferences(
      pattern,
      document.path,
      `files[${index}]`,
    );
    const matches = globSync(expandedPattern, {
      absolute: true,
      caseSensitiveMatch: false,
      cwd: root,
      dot: true,
      expandDirectories: false,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**'],
      onlyFiles: true,
    })
      .filter((path) => /\.ya?ml$/i.test(path))
      .map((path) => resolve(path))
      .sort();
    if (matches.length === 0) {
      fail(
        document.path,
        `files[${index}]`,
        `pattern "${expandedPattern}" did not match any YAML files.`,
      );
    }
    expanded.push(...matches);
  }
  return expanded;
};

const prepareInput = (sourceInput: string): PreparedMigration => {
  const source = resolve(sourceInput);
  if (!existsSync(source)) {
    throw new Error(`Legacy YAML source does not exist: ${source}`);
  }
  const sourceStat = statSync(source);
  if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
    throw new Error(
      `Legacy YAML source must be a file or directory: ${source}`,
    );
  }

  if (sourceStat.isFile()) {
    if (!/\.ya?ml$/i.test(source)) {
      throw new Error(`Legacy YAML source must use .yaml or .yml: ${source}`);
    }
    const document = parseYamlDocument(source);
    const isBatch = Array.isArray(document.value.files);
    const isScript = Array.isArray(document.value.tasks);
    if (isBatch === isScript) {
      throw new Error(
        `${source}: expected exactly one of a batch "files" array or script "tasks" array.`,
      );
    }
    const batchDocument = isBatch ? document : undefined;
    const scripts = isBatch
      ? expandBatchFiles(document).map(parseYamlDocument)
      : [document];
    const batch = normalizeBatch(batchDocument);
    return {
      source,
      sourceRoot: dirname(source),
      batch,
      scripts,
      warnings: [...batch.warnings],
    };
  }

  const candidates = globSync(YAML_PATTERNS, {
    absolute: true,
    caseSensitiveMatch: false,
    cwd: source,
    dot: true,
    expandDirectories: false,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**'],
    onlyFiles: true,
  })
    .map((path) => resolve(path))
    .sort()
    .map(parseYamlDocument);
  const batchCandidates = candidates.filter(
    (candidate) =>
      Array.isArray(candidate.value.files) &&
      !Array.isArray(candidate.value.tasks),
  );
  if (batchCandidates.length > 1) {
    throw new Error(
      [
        `Multiple legacy batch configs were found under ${source}; pass one config file explicitly:`,
        ...batchCandidates.map((candidate) => `- ${candidate.path}`),
      ].join('\n'),
    );
  }
  const batchDocument = batchCandidates[0];
  const scripts = batchDocument
    ? expandBatchFiles(batchDocument).map(parseYamlDocument)
    : candidates.filter((candidate) => Array.isArray(candidate.value.tasks));
  if (scripts.length === 0) {
    throw new Error(
      `No legacy YAML scripts with a "tasks" array found: ${source}`,
    );
  }
  const batch = normalizeBatch(batchDocument);
  const warnings = [...batch.warnings];
  if (!batchDocument) {
    const ignored = candidates.filter(
      (candidate) => !Array.isArray(candidate.value.tasks),
    );
    for (const candidate of ignored) {
      warnings.push(
        `${candidate.path}: ignored because it is not a legacy script with a tasks array.`,
      );
    }
  }
  return { source, sourceRoot: source, batch, scripts, warnings };
};

const ensureOnlyKeys = (
  value: UnknownRecord,
  allowedKeys: readonly string[],
  path: string,
  location: string,
): void => {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(
      path,
      location,
      `unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`,
    );
  }
};

const normalizePrompt = (
  raw: unknown,
  path: string,
  location: string,
): UnknownRecord => {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return { prompt: raw };
  }
  if (!isRecord(raw)) {
    return fail(path, location, 'must contain a non-empty prompt.');
  }
  ensureOnlyKeys(
    raw,
    ['prompt', 'images', 'convertHttpImage2Base64'],
    path,
    location,
  );
  if (typeof raw.prompt !== 'string' || raw.prompt.trim().length === 0) {
    return fail(path, `${location}.prompt`, 'must be a non-empty string.');
  }
  return structuredClone(raw);
};

const rewriteEnvironmentReferences = (
  value: unknown,
  path: string,
  location: string,
  bridges: LegacyEnvironmentBridge[],
): unknown => {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]*)\}/g, (match, rawName: string) => {
      if (!rawName) return match;
      const name = rawName.trim();
      const fallback = `\${${rawName}}`;
      let bridge = bridges.find((candidate) => candidate.fallback === fallback);
      if (!bridge) {
        bridge = {
          alias: `__legacy_env_${bridges.length + 1}`,
          name,
          fallback,
        };
        bridges.push(bridge);
      }
      return `\${${bridge.alias}}`;
    });
  }
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      rewriteEnvironmentReferences(
        child,
        path,
        `${location}[${index}]`,
        bridges,
      ),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (hasEnvironmentReference(key)) {
          fail(
            path,
            `${location} key`,
            'environment references in step object keys have no lossless Test Runner mapping; replace the dynamic key with a concrete key in a migration copy.',
          );
        }
        return [
          key,
          rewriteEnvironmentReferences(
            child,
            path,
            `${location}.${key}`,
            bridges,
          ),
        ];
      }),
    );
  }
  return value;
};

const convertAiAct = (
  step: UnknownRecord,
  path: string,
  location: string,
  warnings: string[],
): UnknownRecord => {
  ensureOnlyKeys(
    step,
    [
      'ai',
      'aiAction',
      'aiAct',
      'instruction',
      'aiActionProgressTips',
      'planningStrategy',
      'cacheable',
      'fileChooserAccept',
      'deepThink',
      'deepLocate',
      'context',
    ],
    path,
    location,
  );
  if (step.aiActionProgressTips !== undefined) {
    warnings.push(
      `${path} (${location}): aiActionProgressTips is display-only and was omitted.`,
    );
  }
  if (step.planningStrategy !== undefined) {
    warnings.push(
      `${path} (${location}): legacy planningStrategy was not consumed by aiAct and was omitted.`,
    );
  }
  const actionPrompt = step.aiAct ?? step.aiAction ?? step.ai;
  const instruction = step.instruction;
  const promptSource =
    (typeof instruction === 'string' && instruction.length > 0) ||
    (isRecord(instruction) && typeof instruction.prompt === 'string')
      ? instruction
      : actionPrompt;
  const prompt = normalizePrompt(promptSource, path, location);
  const options = Object.fromEntries(
    ['cacheable', 'fileChooserAccept', 'deepThink', 'deepLocate', 'context']
      .filter((key) => step[key] !== undefined)
      .map((key) => [key, structuredClone(step[key])]),
  );
  return {
    aiAct: {
      ...prompt,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    },
  };
};

const convertAiAssert = (
  step: UnknownRecord,
  path: string,
  location: string,
  warnings: string[],
): UnknownRecord => {
  ensureOnlyKeys(
    step,
    [
      'aiAssert',
      'errorMessage',
      'name',
      'context',
      'domIncluded',
      'screenshotIncluded',
      'images',
      'convertHttpImage2Base64',
    ],
    path,
    location,
  );
  const prompt = normalizePrompt(step.aiAssert, path, `${location}.aiAssert`);
  if (step.images !== undefined) prompt.images = structuredClone(step.images);
  if (step.convertHttpImage2Base64 !== undefined) {
    prompt.convertHttpImage2Base64 = step.convertHttpImage2Base64;
  }
  if (step.name !== undefined) {
    warnings.push(
      `${path} (${location}): named aiAssert output "${String(step.name)}" is now available in the case result instead of the legacy output JSON.`,
    );
  }
  const options = Object.fromEntries(
    ['context', 'domIncluded', 'screenshotIncluded']
      .filter((key) => step[key] !== undefined)
      .map((key) => [key, structuredClone(step[key])]),
  );
  return {
    aiAssert: {
      ...prompt,
      ...(step.errorMessage === undefined
        ? {}
        : { message: step.errorMessage }),
      ...(Object.keys(options).length > 0 ? { options } : {}),
    },
  };
};

const convertWait = (
  step: UnknownRecord,
  path: string,
  location: string,
): UnknownRecord => {
  ensureOnlyKeys(step, ['sleep'], path, location);
  const rawDuration = step.sleep;
  const duration =
    typeof rawDuration === 'string'
      ? Number.parseInt(rawDuration, 10)
      : rawDuration;
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return fail(path, `${location}.sleep`, 'must be greater than zero.');
  }
  return { wait: { duration, unit: 'ms' } };
};

const convertRecordToReport = (
  step: UnknownRecord,
  path: string,
  location: string,
): UnknownRecord => {
  ensureOnlyKeys(
    step,
    ['recordToReport', 'logScreenshot', 'content'],
    path,
    location,
  );
  const title = step.recordToReport ?? step.logScreenshot ?? 'untitled';
  if (typeof title !== 'string') {
    return fail(path, location, 'report title must be a string.');
  }
  if (step.content !== undefined && typeof step.content !== 'string') {
    return fail(path, `${location}.content`, 'must be a string.');
  }
  return {
    recordToReport: {
      title,
      ...(step.content === undefined ? {} : { content: step.content }),
    },
  };
};

const unsupportedAction = (
  step: UnknownRecord,
  path: string,
  location: string,
): never => {
  const action = Object.keys(step)[0] ?? '<empty step>';
  return fail(
    path,
    location,
    `legacy action "${action}" has no lossless built-in mapping; remove it from a migration copy, then add an equivalent custom Test Runner node to the generated project.`,
  );
};

const validateConvertedStep = (
  step: UnknownRecord,
  path: string,
  location: string,
): void => {
  const [node, input] = Object.entries(step)[0];
  const result =
    node === 'aiAct'
      ? aiActInputSchema.safeParse(input)
      : node === 'aiAssert'
        ? aiAssertInputSchema.safeParse(input)
        : node === 'wait'
          ? waitInputSchema.safeParse(input)
          : recordToReportInputSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    fail(
      path,
      location,
      `converted ${node}${field} is invalid: ${issue.message}`,
    );
  }
};

const convertStep = (
  rawStep: unknown,
  path: string,
  location: string,
  warnings: string[],
  environmentBridges: LegacyEnvironmentBridge[],
): UnknownRecord => {
  if (!isRecord(rawStep) || Object.keys(rawStep).length === 0) {
    return fail(path, location, 'must be a non-empty mapping.');
  }
  let converted: UnknownRecord;
  if (
    Object.hasOwn(rawStep, 'aiAct') ||
    Object.hasOwn(rawStep, 'aiAction') ||
    Object.hasOwn(rawStep, 'ai')
  ) {
    converted = convertAiAct(rawStep, path, location, warnings);
  } else if (Object.hasOwn(rawStep, 'aiAssert')) {
    converted = convertAiAssert(rawStep, path, location, warnings);
  } else if (Object.hasOwn(rawStep, 'sleep')) {
    converted = convertWait(rawStep, path, location);
  } else if (
    Object.hasOwn(rawStep, 'recordToReport') ||
    Object.hasOwn(rawStep, 'logScreenshot')
  ) {
    converted = convertRecordToReport(rawStep, path, location);
  } else {
    return unsupportedAction(rawStep, path, location);
  }
  const rewritten = rewriteEnvironmentReferences(
    converted,
    path,
    location,
    environmentBridges,
  ) as UnknownRecord;
  validateConvertedStep(rewritten, path, location);
  return rewritten;
};

const normalizeAgentOptions = (
  script: UnknownRecord,
  target: UnknownRecord,
  path: string,
  warnings: string[],
): UnknownRecord => {
  const rawAgent = script.agent;
  if (rawAgent !== undefined && !isRecord(rawAgent)) {
    fail(path, 'agent', 'must be a mapping.');
  }
  const agent = structuredClone((rawAgent as UnknownRecord | undefined) ?? {});
  ensureOnlyKeys(
    agent,
    [
      'testId',
      'groupName',
      'groupDescription',
      'generateReport',
      'persistExecutionDump',
      'autoPrintReportMsg',
      'reportFileName',
      'replanningCycleLimit',
      'aiActContext',
      'aiActionContext',
      'cache',
      'screenshotShrinkFactor',
    ],
    path,
    'agent',
  );
  for (const key of [
    'testId',
    'groupName',
    'groupDescription',
    'reportFileName',
    'aiActContext',
    'aiActionContext',
  ]) {
    validateOptionalString(agent[key], path, `agent.${key}`);
  }
  for (const key of [
    'generateReport',
    'persistExecutionDump',
    'autoPrintReportMsg',
  ]) {
    validateBoolean(agent[key], path, `agent.${key}`, false);
  }
  if (agent.replanningCycleLimit !== undefined) {
    validateNonNegativeInteger(
      agent.replanningCycleLimit,
      path,
      'agent.replanningCycleLimit',
      0,
    );
  }
  if (agent.screenshotShrinkFactor !== undefined) {
    rejectTypedEnvironmentReference(
      agent.screenshotShrinkFactor,
      path,
      'agent.screenshotShrinkFactor',
    );
    if (
      typeof agent.screenshotShrinkFactor !== 'number' ||
      !Number.isFinite(agent.screenshotShrinkFactor) ||
      agent.screenshotShrinkFactor <= 0
    ) {
      fail(
        path,
        'agent.screenshotShrinkFactor',
        'must be a finite number greater than zero.',
      );
    }
  }
  if (
    agent.cache !== undefined &&
    agent.cache !== false &&
    agent.cache !== true &&
    !isRecord(agent.cache)
  ) {
    rejectTypedEnvironmentReference(agent.cache, path, 'agent.cache');
    fail(
      path,
      'agent.cache',
      'must be false or a mapping with an explicit id.',
    );
  }
  if (isRecord(agent.cache)) {
    ensureOnlyKeys(
      agent.cache,
      ['id', 'strategy', 'cacheDir'],
      path,
      'agent.cache',
    );
    validateOptionalString(agent.cache.id, path, 'agent.cache.id');
    validateOptionalString(agent.cache.strategy, path, 'agent.cache.strategy');
    validateOptionalString(agent.cache.cacheDir, path, 'agent.cache.cacheDir');
    if (
      agent.cache.id === undefined ||
      (typeof agent.cache.id === 'string' && agent.cache.id.length === 0)
    ) {
      fail(path, 'agent.cache.id', 'must be a non-empty string.');
    }
  }
  const aiActContext =
    agent.aiActContext ??
    agent.aiActionContext ??
    target.aiActContext ??
    target.aiActionContext;
  const reportFileName = agent.reportFileName ?? agent.testId;
  if (agent.testId !== undefined && agent.reportFileName === undefined) {
    warnings.push(
      `${path} (agent.testId): migrated to reportFileName; generated case run IDs are appended to prevent report collisions.`,
    );
  } else if (agent.reportFileName !== undefined) {
    warnings.push(
      `${path} (agent.reportFileName): generated case run IDs are appended to prevent report collisions.`,
    );
  }
  if (agent.aiActionContext !== undefined && agent.aiActContext === undefined) {
    warnings.push(`${path} (agent.aiActionContext): migrated to aiActContext.`);
  }
  if (agent.cache === true) {
    fail(
      path,
      'agent.cache',
      'boolean true is deprecated and has no stable cache ID; use { id, strategy } before migration.',
    );
  }
  const normalized = Object.fromEntries(
    [
      'groupName',
      'groupDescription',
      'generateReport',
      'persistExecutionDump',
      'autoPrintReportMsg',
      'replanningCycleLimit',
      'cache',
      'screenshotShrinkFactor',
    ]
      .filter((key) => agent[key] !== undefined)
      .map((key) => [key, agent[key]]),
  );
  if (reportFileName !== undefined) normalized.reportFileName = reportFileName;
  if (aiActContext !== undefined) normalized.aiActContext = aiActContext;
  return normalized;
};

const normalizeTarget = (
  scriptTarget: LegacyWebTargetSource | undefined,
  batch: LegacyBatchOptions,
  path: string,
  warnings: string[],
): { target: NormalizedWebTarget; rawTarget: UnknownRecord } => {
  if (scriptTarget && batch.target && scriptTarget.mode !== batch.target.mode) {
    fail(
      path,
      '',
      `script target mode "${scriptTarget.mode}" conflicts with batch target mode "${batch.target.mode}".`,
    );
  }
  const mode = scriptTarget?.mode ?? batch.target?.mode;
  const rawTarget = mergeRecords(
    scriptTarget?.value ?? {},
    batch.target?.value ?? {},
  );
  if (!mode) {
    return fail(
      path,
      '',
      'no Web target was found in the script or its batch config.',
    );
  }
  const unsupportedKeys = [
    'serve',
    'cookie',
    'downloadPath',
    'bridgeMode',
    'closeNewTabsAfterDisconnect',
    'cdpEndpoint',
  ].filter((key) => rawTarget[key] !== undefined);
  if (unsupportedKeys.length > 0) {
    fail(
      path,
      `${scriptTarget?.source ?? batch.target?.source ?? 'web'}.${unsupportedKeys[0]}`,
      `cannot be migrated losslessly to the generated Playwright setup. Unsupported target fields: ${unsupportedKeys.join(', ')}.`,
    );
  }
  const allowedTargetKeys = [
    'mode',
    'url',
    'output',
    'unstableLogContent',
    'userAgent',
    'acceptInsecureCerts',
    'viewportWidth',
    'viewportHeight',
    'deviceScaleFactor',
    'waitForNetworkIdle',
    'extraHTTPHeaders',
    'forceSameTabNavigation',
    'autoFollowNewPage',
    'chromeArgs',
    'aiActContext',
    'aiActionContext',
    'testId',
    'groupName',
    'groupDescription',
    'generateReport',
    'persistExecutionDump',
    'autoPrintReportMsg',
    'reportFileName',
    'replanningCycleLimit',
    'cache',
    'screenshotShrinkFactor',
  ];
  ensureOnlyKeys(rawTarget, allowedTargetKeys, path, 'web target');
  if (rawTarget.output !== undefined) {
    warnings.push(
      `${path} (web.output): legacy result JSON is replaced by the Test Runner summary and case result files.`,
    );
  }
  if (rawTarget.unstableLogContent !== undefined) {
    warnings.push(
      `${path} (web.unstableLogContent): unstable agent log output was not migrated.`,
    );
  }
  const url = rawTarget.url;
  if (typeof url !== 'string' || url.trim().length === 0) {
    return fail(path, 'web.url', 'must be a non-empty string.');
  }
  if (rawTarget.forceSameTabNavigation !== undefined && mode === 'browser') {
    fail(
      path,
      'web.forceSameTabNavigation',
      'cannot be used with browser mode.',
    );
  }
  if (rawTarget.autoFollowNewPage === true && mode !== 'browser') {
    fail(path, 'web.autoFollowNewPage', 'requires browser mode.');
  }
  const waitForNetworkIdle = rawTarget.waitForNetworkIdle;
  if (waitForNetworkIdle !== undefined && !isRecord(waitForNetworkIdle)) {
    fail(path, 'web.waitForNetworkIdle', 'must be a mapping.');
  }
  if (isRecord(waitForNetworkIdle)) {
    ensureOnlyKeys(
      waitForNetworkIdle,
      ['timeout', 'continueOnNetworkIdleError'],
      path,
      'web.waitForNetworkIdle',
    );
  }
  const networkIdleTimeout = isRecord(waitForNetworkIdle)
    ? waitForNetworkIdle.timeout
    : undefined;
  rejectTypedEnvironmentReference(
    networkIdleTimeout,
    path,
    'web.waitForNetworkIdle.timeout',
  );
  if (
    networkIdleTimeout !== undefined &&
    (typeof networkIdleTimeout !== 'number' ||
      !Number.isFinite(networkIdleTimeout) ||
      networkIdleTimeout < 0)
  ) {
    fail(
      path,
      'web.waitForNetworkIdle.timeout',
      'must be a non-negative number.',
    );
  }
  const rawHeaders = rawTarget.extraHTTPHeaders;
  if (rawHeaders !== undefined && !isRecord(rawHeaders)) {
    fail(path, 'web.extraHTTPHeaders', 'must be a mapping.');
  }
  const headers = isRecord(rawHeaders)
    ? Object.fromEntries(
        Object.entries(rawHeaders).map(([key, value]) => [key, String(value)]),
      )
    : undefined;
  const rawChromeArgs = rawTarget.chromeArgs;
  if (
    rawChromeArgs !== undefined &&
    (!Array.isArray(rawChromeArgs) ||
      rawChromeArgs.some((value) => typeof value !== 'string'))
  ) {
    fail(path, 'web.chromeArgs', 'must be an array of strings.');
  }
  const deviceScaleFactor = rawTarget.deviceScaleFactor;
  rejectTypedEnvironmentReference(
    deviceScaleFactor,
    path,
    'web.deviceScaleFactor',
  );
  if (
    deviceScaleFactor !== undefined &&
    (typeof deviceScaleFactor !== 'number' || deviceScaleFactor <= 0)
  ) {
    fail(path, 'web.deviceScaleFactor', 'must be greater than zero.');
  }
  if (
    rawTarget.userAgent !== undefined &&
    typeof rawTarget.userAgent !== 'string'
  ) {
    fail(path, 'web.userAgent', 'must be a string.');
  }
  validateOptionalString(rawTarget.aiActContext, path, 'web.aiActContext');
  validateOptionalString(
    rawTarget.aiActionContext,
    path,
    'web.aiActionContext',
  );

  return {
    rawTarget,
    target: {
      url,
      mode,
      headless: !batch.headed,
      userAgent:
        (rawTarget.userAgent as string | undefined) ?? DEFAULT_USER_AGENT,
      acceptInsecureCerts: validateBoolean(
        rawTarget.acceptInsecureCerts,
        path,
        'web.acceptInsecureCerts',
        false,
      ),
      viewportWidth: validatePositiveInteger(
        rawTarget.viewportWidth,
        path,
        'web.viewportWidth',
        1440,
      ),
      viewportHeight: validatePositiveInteger(
        rawTarget.viewportHeight,
        path,
        'web.viewportHeight',
        800,
      ),
      waitForNetworkIdleTimeout:
        (networkIdleTimeout as number | undefined) ?? 2000,
      continueOnNetworkIdleError: validateBoolean(
        isRecord(waitForNetworkIdle)
          ? waitForNetworkIdle.continueOnNetworkIdleError
          : undefined,
        path,
        'web.waitForNetworkIdle.continueOnNetworkIdleError',
        true,
      ),
      ...(deviceScaleFactor === undefined
        ? {}
        : { deviceScaleFactor: deviceScaleFactor as number }),
      ...(headers ? { extraHTTPHeaders: headers } : {}),
      ...(rawTarget.forceSameTabNavigation === undefined
        ? {}
        : {
            forceSameTabNavigation: validateBoolean(
              rawTarget.forceSameTabNavigation,
              path,
              'web.forceSameTabNavigation',
              true,
            ),
          }),
      ...(rawTarget.autoFollowNewPage === undefined
        ? {}
        : {
            autoFollowNewPage: validateBoolean(
              rawTarget.autoFollowNewPage,
              path,
              'web.autoFollowNewPage',
              false,
            ),
          }),
      ...(rawChromeArgs === undefined
        ? {}
        : { chromeArgs: rawChromeArgs as string[] }),
    },
  };
};

const slugify = (value: string, fallback: string): string => {
  const slug = value
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || fallback;
};

const prepareWorkflows = (input: PreparedMigration): PreparedWorkflow[] => {
  const workflows: PreparedWorkflow[] = [];
  const usedProjectNames = new Set<string>();
  const usedWorkflowFiles = new Set<string>();
  const errors: string[] = [];

  for (const [scriptIndex, document] of input.scripts.entries()) {
    try {
      const { path, value } = document;
      if (!Array.isArray(value.tasks) || value.tasks.length === 0) {
        return fail(path, 'tasks', 'must be a non-empty array.');
      }
      ensureOnlyKeys(
        value,
        [
          'target',
          'page',
          'browser',
          'web',
          'android',
          'ios',
          'harmony',
          'computer',
          'interface',
          'config',
          'agent',
          'tasks',
        ],
        path,
        'script',
      );
      const scriptTarget = getLegacyWebTarget(value, path);
      const { target, rawTarget } = normalizeTarget(
        scriptTarget,
        input.batch,
        path,
        input.warnings,
      );
      const environmentBridges: LegacyEnvironmentBridge[] = [];
      const cases = value.tasks.map((rawTask, taskIndex) => {
        const taskLocation = `tasks[${taskIndex}]`;
        if (!isRecord(rawTask)) {
          return fail(path, taskLocation, 'must be a mapping.');
        }
        ensureOnlyKeys(
          rawTask,
          ['name', 'flow', 'continueOnError'],
          path,
          taskLocation,
        );
        if (
          typeof rawTask.name !== 'string' ||
          rawTask.name.trim().length === 0
        ) {
          return fail(
            path,
            `${taskLocation}.name`,
            'must be a non-empty string.',
          );
        }
        if (rawTask.continueOnError === true) {
          return fail(
            path,
            `${taskLocation}.continueOnError`,
            'cannot be represented per case by the new runner; split this task into a separately invoked project before migration.',
          );
        }
        if (
          rawTask.continueOnError !== undefined &&
          typeof rawTask.continueOnError !== 'boolean'
        ) {
          return fail(
            path,
            `${taskLocation}.continueOnError`,
            'must be a boolean.',
          );
        }
        if (!Array.isArray(rawTask.flow) || rawTask.flow.length === 0) {
          return fail(
            path,
            `${taskLocation}.flow`,
            'must be a non-empty array.',
          );
        }
        return {
          name: rawTask.name,
          steps: rawTask.flow.map((step, stepIndex) =>
            convertStep(
              step,
              path,
              `${taskLocation}.flow[${stepIndex}]`,
              input.warnings,
              environmentBridges,
            ),
          ),
        };
      });
      if (input.batch.continueOnError && cases.length > 1) {
        fail(
          path,
          'tasks',
          'batch continueOnError cannot preserve file-local stop behavior for a script with multiple tasks; split it into one task per file first.',
        );
      }
      if (input.batch.retry > 0 && cases.length > 1) {
        input.warnings.push(
          `${path}: retry now applies independently to each migrated task/case instead of rerunning at legacy file granularity.`,
        );
      }

      const sourceName = basename(path, extname(path));
      let projectName = sourceName;
      let projectSuffix = 1;
      while (usedProjectNames.has(projectName)) {
        projectSuffix += 1;
        projectName = `${sourceName} (${projectSuffix})`;
      }
      usedProjectNames.add(projectName);
      const slugBase = slugify(sourceName, `legacy-${scriptIndex + 1}`);
      let workflowFile = `cases/${slugBase}.yaml`;
      let workflowSuffix = 1;
      while (usedWorkflowFiles.has(workflowFile)) {
        workflowSuffix += 1;
        workflowFile = `cases/${slugBase}-${workflowSuffix}.yaml`;
      }
      usedWorkflowFiles.add(workflowFile);
      workflows.push({
        sourcePath: path,
        sourceDisplayPath: sourceLabel(input.sourceRoot, path),
        projectName,
        workflowFile,
        environmentBridges,
        target,
        agentOptions: normalizeAgentOptions(
          value,
          rawTarget,
          path,
          input.warnings,
        ),
        retry: input.batch.retry,
        document: { cases },
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    throw new Error(
      [
        `Legacy YAML migration found ${errors.length} blocking issue${errors.length === 1 ? '' : 's'}:`,
        ...errors.map((error) => `- ${error}`),
        'No output was written. Fix these items in a migration copy, run migration again, then add any required custom Nodes or setup to the generated project.',
      ].join('\n'),
    );
  }
  return workflows;
};

const renderConfig = (
  workflows: readonly PreparedWorkflow[],
  batch: LegacyBatchOptions,
): string => {
  const projectData = workflows.map((workflow) => ({
    name: workflow.projectName,
    file: workflow.workflowFile,
    retry: workflow.retry,
    environmentBridges: workflow.environmentBridges,
    target: workflow.target,
    agentOptions: workflow.agentOptions,
  }));
  return `import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent, PlaywrightBrowserAgent } from '@midscene/web/playwright';
import { type BrowserContext, type Page, chromium } from 'playwright';

type PageAgentOptions = NonNullable<ConstructorParameters<typeof PlaywrightAgent>[1]>;
type LegacyAgent = PlaywrightAgent | PlaywrightBrowserAgent;

interface LegacyWebTarget {
  url: string;
  mode: 'page' | 'browser';
  headless: boolean;
  userAgent: string;
  acceptInsecureCerts: boolean;
  viewportWidth: number;
  viewportHeight: number;
  waitForNetworkIdleTimeout: number;
  continueOnNetworkIdleError: boolean;
  deviceScaleFactor?: number;
  extraHTTPHeaders?: Record<string, string>;
  forceSameTabNavigation?: boolean;
  autoFollowNewPage?: boolean;
  chromeArgs?: string[];
}

interface LegacyProjectContext {
  browserContext: BrowserContext;
  page: Page;
  target: LegacyWebTarget;
  agentOptions: PageAgentOptions;
  reportName: string;
}

interface LegacyProjectDefinition {
  name: string;
  file: string;
  retry: number;
  environmentBridges: Array<{
    alias: string;
    name: string;
    fallback: string;
  }>;
  target: LegacyWebTarget;
  agentOptions: PageAgentOptions;
}

const resolveLegacyEnv = <T>(value: T): T => {
  if (typeof value === 'string') {
    return value.replace(/\\$\\{([^}]*)\\}/g, (match, rawName: string) => {
      if (!rawName) return match;
      const name = rawName.trim();
      const resolved = process.env[name];
      if (resolved === undefined) throw new Error(\`Environment variable "\${name}" is not defined.\`);
      return resolved;
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(resolveLegacyEnv) as unknown as T;
  if (typeof value === 'object' && value !== null) {
    const resolvedEntries: Array<[string, unknown]> = [];
    const resolvedKeys = new Set<string>();
    for (const [key, child] of Object.entries(value)) {
      const resolvedKey = resolveLegacyEnv(key);
      if (resolvedKeys.has(resolvedKey)) {
        throw new Error(\`Environment interpolation produced duplicate object key "\${resolvedKey}".\`);
      }
      resolvedKeys.add(resolvedKey);
      resolvedEntries.push([resolvedKey, resolveLegacyEnv(child)]);
    }
    return Object.fromEntries(resolvedEntries) as unknown as T;
  }
  return value;
};

const rawProjectDefinitions = ${JSON.stringify(projectData, null, 2)} as LegacyProjectDefinition[];
const projectDefinitions = rawProjectDefinitions.map((definition) => ({
  ...definition,
  target: resolveLegacyEnv(definition.target),
  agentOptions: resolveLegacyEnv(definition.agentOptions),
}));

const legacyStepVariables = (definition: LegacyProjectDefinition) =>
  Object.fromEntries(
    definition.environmentBridges.map(({ alias, name, fallback }) => [
      alias,
      process.env[name] ?? fallback,
    ]),
  );

const createLegacySetup = (definition: LegacyProjectDefinition) =>
  defineProjectSetup<LegacyProjectContext>({
    name: \`legacy-web-\${definition.name}\`,
    platform: 'web',
    async setup({ onTeardown }) {
      const browser = await chromium.launch({
        headless: definition.target.headless,
        ...(definition.target.chromeArgs ? { args: definition.target.chromeArgs } : {}),
      });
      onTeardown(() => browser.close());
      const browserContext = await browser.newContext({
        viewport: {
          width: definition.target.viewportWidth,
          height: definition.target.viewportHeight,
        },
        userAgent: definition.target.userAgent,
        ignoreHTTPSErrors: definition.target.acceptInsecureCerts,
        ...(definition.target.deviceScaleFactor === undefined
          ? {}
          : { deviceScaleFactor: definition.target.deviceScaleFactor }),
        ...(definition.target.extraHTTPHeaders
          ? { extraHTTPHeaders: definition.target.extraHTTPHeaders }
          : {}),
      });
      onTeardown(() => browserContext.close());
      const page = await browserContext.newPage();
      await page.goto(definition.target.url);
      if (definition.target.waitForNetworkIdleTimeout > 0) {
        try {
          await page.waitForLoadState('networkidle', {
            timeout: definition.target.waitForNetworkIdleTimeout,
          });
        } catch (error) {
          if (!definition.target.continueOnNetworkIdleError) throw error;
        }
      }
      return {
        browserContext,
        page,
        target: definition.target,
        agentOptions: definition.agentOptions,
        reportName: definition.file.replace(/^cases\\//, '').replace(/\\.ya?ml$/i, ''),
      };
    },
  });

const agents = new Map<string, LegacyAgent>();
const midsceneNodes = createMidsceneNodes<LegacyProjectContext>({
  includeLaunch: false,
  agentProvider: {
    getAgent(runId, { context }) {
      const existing = agents.get(runId);
      if (existing) return existing;
      const reportBase = context.agentOptions.reportFileName ?? context.reportName;
      const commonOptions = {
        ...context.agentOptions,
        reportFileName: \`\${reportBase}-\${runId}\`,
      };
      const agent =
        context.target.mode === 'browser'
          ? new PlaywrightBrowserAgent(context.browserContext, context.page, {
              ...commonOptions,
              autoFollowNewPage: context.target.autoFollowNewPage,
            })
          : new PlaywrightAgent(context.page, {
              ...commonOptions,
              forceSameTabNavigation: context.target.forceSameTabNavigation,
            });
      agents.set(runId, agent);
      return agent;
    },
    async releaseAgent(runId) {
      const agent = agents.get(runId);
      if (!agent) return;
      try {
        await agent.destroy();
        return { reportPath: agent.reportFile || undefined };
      } finally {
        agents.delete(runId);
      }
    },
  },
});

export default defineTestProject<LegacyProjectContext>({
  test: {
    maxConcurrency: ${batch.concurrent},
    bail: ${batch.continueOnError ? 0 : 1},
  },
  projects: projectDefinitions.map((definition) => ({
    name: definition.name,
    platform: 'web' as const,
    files: { include: [definition.file] },
    retry: definition.retry,
    variables: legacyStepVariables(definition),
    setup: createLegacySetup(definition),
  })),
  nodes: [...midsceneNodes],
});
`;
};

const renderMigrationReport = (
  input: PreparedMigration,
  workflows: readonly PreparedWorkflow[],
): string => {
  const sourceKind = input.batch.sourcePath
    ? 'legacy batch config'
    : 'legacy YAML source';
  const lines = [
    '# Legacy YAML migration report',
    '',
    `Generated from ${sourceKind}: \`${input.source}\`. The source files were not modified.`,
    '',
    '## Converted files',
    '',
    ...workflows.map(
      (workflow) =>
        `- \`${workflow.sourceDisplayPath}\` → \`${workflow.workflowFile}\` (${workflow.document.cases.length} case${workflow.document.cases.length === 1 ? '' : 's'})`,
    ),
    '',
    '## Review before switching CI',
    '',
    '- The generated runtime uses Playwright. Run the migrated suite beside the legacy suite and compare outcomes before removing the old command.',
    '- Each legacy task is a Test Runner case. Result JSON and reports therefore use the new runner layout.',
    '- Legacy `${ENV_NAME}` references inside steps use generated Project-variable bridges: an available environment value is used, while a missing value remains the original literal just as in the legacy runner. Config references are resolved from `process.env`.',
    '- `describe-nodes` is optional documentation output and does not affect execution.',
    ...(input.warnings.length > 0
      ? [
          '',
          '## Migration warnings',
          '',
          ...input.warnings.map((warning) => `- ${warning}`),
        ]
      : []),
    '',
    '## Run',
    '',
    '```bash',
    'pnpm add -D @midscene/test @midscene/web playwright',
    'pnpm exec playwright install chromium',
    'pnpm exec midscene-test .',
    '```',
    '',
  ];
  return lines.join('\n');
};

const writePreparedMigration = (
  outputDir: string,
  config: string,
  report: string,
  workflows: readonly PreparedWorkflow[],
): void => {
  const outputParent = dirname(outputDir);
  mkdirSync(outputParent, { recursive: true });
  const temporary = mkdtempSync(join(outputParent, '.midscene-migrate-'));
  try {
    mkdirSync(join(temporary, 'cases'));
    writeFileSync(join(temporary, 'midscene.config.ts'), config);
    writeFileSync(join(temporary, 'MIGRATION.md'), report);
    for (const workflow of workflows) {
      writeFileSync(
        join(temporary, workflow.workflowFile),
        dumpYaml(workflow.document, {
          lineWidth: -1,
          noRefs: true,
          schema: JSON_SCHEMA,
        }),
      );
    }
    if (existsSync(outputDir)) {
      throw new Error(`Migration output already exists: ${outputDir}`);
    }
    renameSync(temporary, outputDir);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
};

export const migrateLegacyYamlProject = (
  options: LegacyYamlMigrationOptions,
): LegacyYamlMigrationResult => {
  const source = resolve(options.source);
  const outputDir = resolve(options.outputDir);
  if (source === outputDir) {
    throw new Error(
      'Migration output must be different from the legacy source.',
    );
  }
  if (existsSync(outputDir)) {
    throw new Error(`Migration output already exists: ${outputDir}`);
  }

  const input = prepareInput(source);
  const workflows = prepareWorkflows(input);
  const config = renderConfig(workflows, input.batch);
  const report = renderMigrationReport(input, workflows);
  writePreparedMigration(outputDir, config, report, workflows);

  return {
    source,
    outputDir,
    configPath: join(outputDir, 'midscene.config.ts'),
    reportPath: join(outputDir, 'MIGRATION.md'),
    workflowPaths: workflows.map((workflow) =>
      join(outputDir, workflow.workflowFile),
    ),
    warnings: [...input.warnings],
  };
};
