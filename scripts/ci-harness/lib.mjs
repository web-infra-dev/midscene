import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const VALID_OUTCOMES = new Set([
  'success',
  'failure',
  'cancelled',
  'skipped',
]);
const VALID_STAGE_KINDS = new Set(['case', 'check', 'infrastructure']);
const TEXT_FILE_EXTENSIONS = new Set([
  '.html',
  '.json',
  '.log',
  '.md',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shortHash(value) {
  return sha256(value).slice(0, 12);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function safeSegment(value) {
  const normalized = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'unnamed';
}

function markdown(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function markdownCode(value) {
  return `<code>${markdown(value)}</code>`;
}

function html(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root) {
  const files = [];
  if (!(await exists(root))) return files;
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [root];

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function resolveWorkspacePath(workspace, inputPath) {
  const resolved = path.resolve(workspace, inputPath);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Harness evidence path must stay inside the workspace: ${inputPath}`);
  }
  return resolved;
}

function parseList(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseStages(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error(`Invalid HARNESS_STAGES JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('HARNESS_STAGES must contain at least one stage');
  }

  const ids = new Set();
  return parsed.map((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new Error(`Harness stage ${index} must be an object`);
    }

    const id = String(stage.id ?? '').trim();
    if (!id) throw new Error(`Harness stage ${index} is missing id`);
    if (ids.has(id)) throw new Error(`Duplicate harness stage id: ${id}`);
    ids.add(id);

    const kind = stage.kind ?? 'case';
    if (!VALID_STAGE_KINDS.has(kind)) {
      throw new Error(`Harness stage ${id} has invalid kind: ${kind}`);
    }

    const outcome = stage.outcome || 'skipped';
    if (!VALID_OUTCOMES.has(outcome)) {
      throw new Error(`Harness stage ${id} has invalid outcome: ${outcome}`);
    }

    const reportPatterns = (
      stage.reportPatterns ??
      (stage.reportPattern ? [stage.reportPattern] : [])
    ).map(String);

    return {
      id,
      name: String(stage.name ?? id),
      kind,
      outcome,
      required: stage.required !== false,
      traceRequired: stage.traceRequired === true,
      reportPatterns,
      validator: {
        type: String(stage.validator?.type ?? 'command-exit'),
        expected: String(
          stage.validator?.expected ?? 'The command exits successfully',
        ),
      },
    };
  });
}

export async function resolveStages({
  workspace,
  suite,
  inlineStages,
  outcomes,
}) {
  if (String(inlineStages ?? '').trim()) return parseStages(inlineStages);
  let outcomeMap;
  try {
    outcomeMap = JSON.parse(outcomes || '{}');
  } catch (error) {
    throw new Error(`Invalid HARNESS_OUTCOMES JSON: ${error.message}`);
  }
  if (!outcomeMap || typeof outcomeMap !== 'object' || Array.isArray(outcomeMap)) {
    throw new Error('HARNESS_OUTCOMES must be a JSON object');
  }

  const registryPath = path.join(workspace, 'scripts', 'ci-harness', 'suites.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const registeredStages = registry[suite];
  if (!Array.isArray(registeredStages)) {
    throw new Error(`No CI harness suite is registered for: ${suite}`);
  }
  const expectedIds = new Set(registeredStages.map((stage) => stage.id));
  const suppliedIds = Object.keys(outcomeMap);
  const missing = [...expectedIds].filter((id) => !(id in outcomeMap));
  const unknown = suppliedIds.filter((id) => !expectedIds.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `Harness outcomes do not match suite ${suite}: missing [${missing.join(', ')}], unknown [${unknown.join(', ')}]`,
    );
  }
  return parseStages(
    registeredStages.map((stage) => ({
      ...stage,
      outcome: outcomeMap[stage.id],
    })),
  );
}

function globToRegExp(pattern) {
  const normalized = toPosix(pattern);
  let expression = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        const followedBySlash = normalized[index + 2] === '/';
        expression += followedBySlash ? '(?:.*/)?' : '.*';
        index += followedBySlash ? 2 : 1;
      } else {
        expression += '[^/]*';
      }
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`);
}

function reportMatches(report, pattern) {
  const matcher = globToRegExp(pattern);
  return matcher.test(report.path) || matcher.test(path.posix.basename(report.path));
}

async function copyRoots({ workspace, roots, outputDir, category, warnings }) {
  const destinations = [];
  for (const [index, inputRoot] of roots.entries()) {
    const source = resolveWorkspacePath(workspace, inputRoot);
    if (!(await exists(source))) {
      warnings.push(`Missing ${category} path: ${inputRoot}`);
      continue;
    }

    const sourceStat = await stat(source);
    const destination = path.join(
      outputDir,
      category,
      `${index + 1}-${safeSegment(path.basename(source))}`,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    if (sourceStat.isDirectory()) {
      await cp(source, destination, { recursive: true, errorOnExist: true });
    } else {
      await copyFile(source, destination);
    }
    destinations.push(destination);
  }
  return destinations;
}

async function removeHiddenFiles(root) {
  for (const file of await listFiles(root)) {
    const relative = path.relative(root, file);
    if (relative.split(path.sep).some((segment) => segment.startsWith('.'))) {
      await unlink(file);
    }
  }
}

async function scanDumpScripts(filePath) {
  const openPrefix = '<script type="midscene_web_dump"';
  const closeTag = '</script>';
  let pending = '';
  const dumps = [];

  for await (const chunk of createReadStream(filePath, { encoding: 'utf8' })) {
    pending += chunk;
    while (pending.length > 0) {
      const start = pending.indexOf(openPrefix);
      if (start === -1) {
        pending = pending.slice(-(openPrefix.length + 1));
        break;
      }
      const previousCharacter = start === 0 ? '' : pending[start - 1];
      const startsHtmlTag =
        start === 0 || previousCharacter === '>' || /\s/.test(previousCharacter);
      if (!startsHtmlTag) {
        pending = pending.slice(start + openPrefix.length);
        continue;
      }
      const openEnd = pending.indexOf('>', start + openPrefix.length);
      if (openEnd === -1) {
        pending = pending.slice(start);
        break;
      }
      const closeStart = pending.indexOf(closeTag, openEnd + 1);
      if (closeStart === -1) {
        pending = pending.slice(start);
        break;
      }

      const serialized = pending
        .slice(openEnd + 1, closeStart)
        .trim()
        .replaceAll('__midscene_lt__', '<')
        .replaceAll('__midscene_gt__', '>');
      try {
        dumps.push(JSON.parse(serialized));
      } catch (error) {
        dumps.push({
          __parseError: error.message,
        });
      }
      pending = pending.slice(closeStart + closeTag.length);
    }
  }
  return dumps;
}

function hasDeepKey(value, keyPattern, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => hasDeepKey(item, keyPattern, seen));
  }
  for (const [key, child] of Object.entries(value)) {
    if (keyPattern.test(key)) return true;
    if (hasDeepKey(child, keyPattern, seen)) return true;
  }
  return false;
}

function modelCall(source, usage) {
  if (!usage || typeof usage !== 'object') return null;
  return {
    source,
    requestId: usage.request_id,
    model: usage.response_model_name ?? usage.model_name,
    intent: usage.intent,
    slot: usage.slot,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedInputTokens: usage.cached_input,
    timeCostMs: usage.time_cost,
  };
}

function compactTask(task, reportPath, executionId, taskIndex) {
  const taskId = String(task.taskId ?? '');
  const modelCalls = [
    modelCall('main', task.usage),
    modelCall('searchArea', task.searchAreaUsage),
  ].filter(Boolean);
  return {
    taskId,
    executionId,
    type: task.type ?? task.name ?? `task-${taskIndex + 1}`,
    status: task.status ?? 'unknown',
    errorMessage: task.errorMessage,
    errorStack: task.errorStack,
    timing: task.timing,
    reasoning: Boolean(task.reasoning_content),
    modelCalls,
    evidence: {
      rawResponse: hasDeepKey(task, /^(rawResponse|rawChoiceMessage)$/),
      screenshot: hasDeepKey(task, /screenshot/i),
      recorder: Array.isArray(task.recorder) && task.recorder.length > 0,
    },
    anchor: taskId ? `${reportPath}#task-${taskId}` : null,
  };
}

function rebaseFileReferences(value, sourceDir, destinationDir) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      rebaseFileReferences(item, sourceDir, destinationDir),
    );
  }
  const rebased = {};
  for (const [key, child] of Object.entries(value)) {
    rebased[key] = rebaseFileReferences(child, sourceDir, destinationDir);
  }
  if (value.storage === 'file' && typeof value.path === 'string') {
    const absoluteReference = path.resolve(sourceDir, value.path);
    rebased.path = toPosix(path.relative(destinationDir, absoluteReference));
  }
  return rebased;
}

async function extractReport(reportFile, outputDir) {
  const relativeReportPath = toPosix(path.relative(outputDir, reportFile));
  const reportId = `report-${shortHash(relativeReportPath)}`;
  const dumps = await scanDumpScripts(reportFile);
  const parseErrors = dumps
    .filter((dump) => dump?.__parseError)
    .map((dump) => dump.__parseError);
  const executionMap = new Map();
  let metadata = {};
  let anonymousExecutionIndex = 0;

  for (const dump of dumps) {
    if (dump?.__parseError) continue;
    if (!Array.isArray(dump)) metadata = { ...metadata, ...dump };
    const executions = Array.isArray(dump)
      ? dump
      : Array.isArray(dump?.executions)
        ? dump.executions
        : Array.isArray(dump?.tasks)
          ? [dump]
          : [];
    for (const execution of executions) {
      if (!execution || !Array.isArray(execution.tasks)) continue;
      const executionId = String(
        execution.id ??
          `anonymous-${shortHash(
            `${relativeReportPath}:${execution.name}:${anonymousExecutionIndex++}`,
          )}`,
      );
      executionMap.set(executionId, { ...execution, id: executionId });
    }
  }

  const executionDir = path.join(outputDir, 'executions', reportId);
  await mkdir(executionDir, { recursive: true });
  const executions = [];
  let executionIndex = 0;
  for (const execution of executionMap.values()) {
    executionIndex += 1;
    const dumpPath = path.join(
      executionDir,
      `${executionIndex}.execution.json`,
    );
    const executionDump = {
      sdkVersion: metadata.sdkVersion ?? 'unknown',
      groupName: metadata.groupName ?? path.basename(reportFile),
      groupDescription: metadata.groupDescription,
      modelBriefs: metadata.modelBriefs ?? [],
      deviceType: metadata.deviceType,
      executions: [
        rebaseFileReferences(
          execution,
          path.dirname(reportFile),
          executionDir,
        ),
      ],
    };
    await writeFile(dumpPath, `${JSON.stringify(executionDump, null, 2)}\n`);
    executions.push({
      executionId: execution.id,
      name: execution.name ?? `execution-${executionIndex}`,
      dumpPath: toPosix(path.relative(outputDir, dumpPath)),
      tasks: execution.tasks.map((task, taskIndex) =>
        compactTask(task, relativeReportPath, execution.id, taskIndex),
      ),
    });
  }

  return {
    reportId,
    path: relativeReportPath,
    sdkVersion: metadata.sdkVersion,
    groupName: metadata.groupName ?? path.basename(reportFile),
    groupDescription: metadata.groupDescription,
    deviceType: metadata.deviceType,
    modelBriefs: metadata.modelBriefs ?? [],
    executions,
    parseErrors,
  };
}

function flattenTasks(reports) {
  return reports.flatMap((report) =>
    report.executions.flatMap((execution) =>
      execution.tasks.map((task) => ({
        ...task,
        reportId: report.reportId,
        reportPath: report.path,
        executionDump: execution.dumpPath,
      })),
    ),
  );
}

function stageVerdict(stage) {
  if (!stage.required) return { verdict: 'not_evaluated', score: null };
  if (stage.outcome === 'success') {
    return {
      verdict: 'pass',
      score: stage.kind === 'case' ? 1 : null,
    };
  }
  if (stage.outcome === 'failure') {
    return {
      verdict: stage.kind === 'infrastructure' ? 'infra_error' : 'fail',
      score: stage.kind === 'case' ? 0 : null,
    };
  }
  return { verdict: 'infra_error', score: null };
}

function stageConfigHash(stage) {
  return sha256(
    JSON.stringify({
      id: stage.id,
      kind: stage.kind,
      required: stage.required,
      traceRequired: stage.traceRequired,
      reportPatterns: stage.reportPatterns,
      validator: stage.validator,
    }),
  );
}

function provenance(environment, suite, stages) {
  const modelBaseUrl = environment.MIDSCENE_MODEL_BASE_URL || '';
  const runId = environment.GITHUB_RUN_ID ?? 'local';
  const runUrl =
    environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && runId !== 'local'
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${runId}`
      : undefined;
  const environmentInfo = {
    repository: environment.GITHUB_REPOSITORY,
    gitSha: environment.GITHUB_SHA,
    ref: environment.GITHUB_REF,
    eventName: environment.GITHUB_EVENT_NAME,
    workflow: environment.GITHUB_WORKFLOW,
    workflowRef: environment.GITHUB_WORKFLOW_REF,
    workflowSha: environment.GITHUB_WORKFLOW_SHA,
    job: environment.GITHUB_JOB,
    runId,
    runUrl,
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT ?? 1),
    runner: {
      name: environment.RUNNER_NAME,
      os: environment.RUNNER_OS ?? process.platform,
      arch: environment.RUNNER_ARCH ?? process.arch,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    model: {
      name: environment.MIDSCENE_MODEL_NAME,
      family: environment.MIDSCENE_MODEL_FAMILY,
      baseUrlHash: modelBaseUrl ? sha256(modelBaseUrl) : undefined,
    },
    retryPolicy: {
      modelRetryCount: Number(environment.MIDSCENE_MODEL_RETRY_COUNT ?? 0),
      modelRetryIntervalMs: Number(
        environment.MIDSCENE_MODEL_RETRY_INTERVAL ?? 0,
      ),
      runnerRetryCount: 0,
    },
    suite,
    suiteConfigHash: sha256(
      JSON.stringify(stages.map((stage) => stageConfigHash(stage))),
    ),
  };
  return {
    ...environmentInfo,
    environmentHash: sha256(JSON.stringify(environmentInfo)),
  };
}

function aggregateVerdict(stages, harnessIssues) {
  if (harnessIssues.length > 0) return 'infra_error';
  const requiredStages = stages.filter((stage) => stage.required);
  if (
    requiredStages.some(
      (stage) =>
        stage.kind === 'infrastructure' && stage.outcome !== 'success',
    )
  ) {
    return 'infra_error';
  }
  if (requiredStages.some((stage) => stage.outcome === 'failure')) return 'fail';
  if (
    requiredStages.some(
      (stage) => stage.outcome === 'cancelled' || stage.outcome === 'skipped',
    )
  ) {
    return 'infra_error';
  }
  return 'pass';
}

async function writeCaseFiles(outputDir, attemptId, result) {
  const caseDir = path.join(
    outputDir,
    'cases',
    `${safeSegment(result.caseId)}-${shortHash(result.caseId)}`,
    safeSegment(attemptId),
  );
  await mkdir(caseDir, { recursive: true });
  const validator = {
    ...result.validator,
    evidenceRefs: [
      ...result.trace.tasks.map(
        (task) => `task:${task.taskId || 'missing'}`,
      ),
      ...new Set(
        result.trace.tasks.map(
          (task) => `execution-dump:${task.executionDump}`,
        ),
      ),
      ...(result.provenance.runUrl
        ? [`github-run:${result.provenance.runUrl}`]
        : []),
    ],
  };
  const traceIndex = {
    schemaVersion: 1,
    caseId: result.caseId,
    attemptId,
    reports: result.trace.reports,
    tasks: result.trace.tasks,
  };
  const resultFile = path.join(caseDir, 'result.json');
  const validatorFile = path.join(caseDir, 'validator.json');
  const traceFile = path.join(caseDir, 'trace-index.json');
  await Promise.all([
    writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`),
    writeFile(validatorFile, `${JSON.stringify(validator, null, 2)}\n`),
    writeFile(traceFile, `${JSON.stringify(traceIndex, null, 2)}\n`),
  ]);
  return {
    result: toPosix(path.relative(outputDir, resultFile)),
    validator: toPosix(path.relative(outputDir, validatorFile)),
    trace: toPosix(path.relative(outputDir, traceFile)),
  };
}

function secretValues(environment) {
  const sensitiveName = /(API_KEY|AUTH_TOKEN|PASSWORD|SECRET|TOKEN)$/i;
  return Object.entries(environment)
    .filter(([key, value]) => sensitiveName.test(key) && String(value).length >= 8)
    .map(([, value]) => String(value));
}

async function containsSecret(filePath, secrets) {
  if (!TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return false;
  }
  const maxSecretLength = Math.max(0, ...secrets.map((secret) => secret.length));
  const overlap = Math.max(4096, maxSecretLength);
  let tail = '';
  for await (const chunk of createReadStream(filePath, { encoding: 'utf8' })) {
    const content = tail + chunk;
    if (secrets.some((secret) => content.includes(secret))) return true;
    tail = content.slice(-overlap);
  }
  return false;
}

async function removeFilesContainingSecrets(outputDir, environment) {
  const findings = [];
  const secrets = secretValues(environment);
  const files = await listFiles(outputDir);
  for (const file of files) {
    if (await containsSecret(file, secrets)) {
      findings.push(toPosix(path.relative(outputDir, file)));
      await unlink(file);
    }
  }
  return findings;
}

async function buildManifest(outputDir) {
  const entries = [];
  for (const file of await listFiles(outputDir)) {
    const relative = toPosix(path.relative(outputDir, file));
    if (relative === 'manifest.json') continue;
    const content = await readFile(file);
    entries.push({
      path: relative,
      bytes: content.byteLength,
      sha256: sha256(content),
    });
  }
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    files: entries,
  };
}

function traceTarget(result, { artifactUrl, traceBaseUrl }) {
  const task = result.trace.tasks.find((item) => item.anchor);
  if (traceBaseUrl && task?.anchor) {
    return `${traceBaseUrl.replace(/\/$/, '')}/${task.anchor}`;
  }
  return artifactUrl || '';
}

export function renderSummary(scorecard, options = {}) {
  const { artifactUrl = '', traceBaseUrl = '' } = options;
  const icon =
    scorecard.verdict === 'pass'
      ? '✅'
      : scorecard.verdict === 'fail'
        ? '❌'
        : '⚠️';
  const lines = [
    `## ${icon} Harness: ${scorecard.suite}`,
    '',
    `Verdict: **${scorecard.verdict}** · Trace: **${scorecard.traceHealth.status}** · Run: ${
      scorecard.provenance.runUrl
        ? `[${markdown(`${scorecard.provenance.runId}.${scorecard.provenance.runAttempt}`)}](${scorecard.provenance.runUrl})`
        : markdownCode(
            `${scorecard.provenance.runId}.${scorecard.provenance.runAttempt}`,
          )
    }`,
    '',
    '| Case | Score | Verdict | Retry visibility | Validator | Trace |',
    '| --- | ---: | --- | --- | --- | --- |',
  ];

  for (const result of scorecard.cases) {
    const target = traceTarget(result, { artifactUrl, traceBaseUrl });
    const firstAnchor = result.trace.tasks.find((task) => task.anchor)?.anchor;
    const trace = target
      ? `[View Trace](${target})${
          !traceBaseUrl && firstAnchor
            ? `<br>${markdownCode(firstAnchor)}`
            : ''
        }`
      : firstAnchor
        ? markdownCode(firstAnchor)
        : 'Unavailable';
    lines.push(
      `| ${markdown(result.name)} | ${result.score ?? '—'} | ${result.verdict} | ${result.stability} | ${markdown(result.validator.type)} | ${trace} |`,
    );
  }

  if (scorecard.checks.length > 0) {
    lines.push('', '### Required checks', '', '| Check | Kind | Outcome |', '| --- | --- | --- |');
    for (const check of scorecard.checks) {
      lines.push(
        `| ${markdown(check.name)} | ${check.kind} | ${check.outcome} |`,
      );
    }
  }

  if (scorecard.harnessIssues.length > 0) {
    lines.push('', '### Harness issues', '');
    for (const issue of scorecard.harnessIssues) lines.push(`- ${markdown(issue)}`);
  }
  if (scorecard.warnings.length > 0) {
    lines.push('', '<details><summary>Collection warnings</summary>', '');
    for (const warning of scorecard.warnings) lines.push(`- ${markdown(warning)}`);
    lines.push('', '</details>');
  }

  lines.push(
    '',
    `Model: ${markdownCode(scorecard.provenance.model.name || 'not configured')} · Runner: ${markdownCode(`${scorecard.provenance.runner.os}/${scorecard.provenance.runner.arch}`)} · Commit: ${markdownCode(scorecard.provenance.gitSha || 'local')}`,
    '',
  );
  return lines.join('\n');
}

export function renderTraceIndex(scorecard) {
  const caseCards = scorecard.cases
    .map((result) => {
      const taskRows = result.trace.tasks
        .map((task) => {
          const tokens = task.modelCalls.reduce(
            (total, call) => total + Number(call.totalTokens ?? 0),
            0,
          );
          const traceLink = task.anchor
            ? `<a href="${html(task.anchor)}">Open task</a> · <a href="${html(task.executionDump)}">Execution JSON</a>`
            : 'Missing task anchor';
          const evidence = [
            task.evidence.rawResponse ? 'raw response' : null,
            task.evidence.screenshot || task.evidence.recorder
              ? 'screenshot'
              : null,
          ]
            .filter(Boolean)
            .join(', ');
          return `<tr><td><code>${html(task.taskId || 'missing')}</code></td><td>${html(task.type)}</td><td>${html(task.status)}</td><td>${tokens}</td><td>${html(evidence || 'none')}</td><td>${traceLink}</td></tr>`;
        })
        .join('');
      const problems = result.trace.problems
        .map((problem) => `<li>${html(problem)}</li>`)
        .join('');
      return `
        <section class="case verdict-${html(result.verdict)}">
          <h2>${html(result.name)} <span>${result.score ?? '—'}</span></h2>
          <dl>
            <dt>Verdict</dt><dd>${html(result.verdict)}</dd>
            <dt>Validator</dt><dd>${html(result.validator.type)}</dd>
            <dt>Expected</dt><dd>${html(result.validator.expected)}</dd>
            <dt>Observed</dt><dd>${html(result.validator.observed)}</dd>
            <dt>Retry visibility</dt><dd>${html(result.stability)}</dd>
            <dt>Validator version</dt><dd><code>${html(result.validator.version)}</code></dd>
          </dl>
          ${problems ? `<div class="issues"><strong>Trace problems</strong><ul>${problems}</ul></div>` : ''}
          <table><thead><tr><th>Task</th><th>Type</th><th>Status</th><th>Tokens</th><th>Evidence</th><th>Trace</th></tr></thead><tbody>${taskRows || '<tr><td colspan="6">No task trace collected</td></tr>'}</tbody></table>
        </section>`;
    })
    .join('');
  const harnessIssues = scorecard.harnessIssues
    .map((issue) => `<li>${html(issue)}</li>`)
    .join('');
  const checkRows = scorecard.checks
    .map(
      (check) =>
        `<tr><td>${html(check.name)}</td><td>${html(check.kind)}</td><td>${html(check.outcome)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Midscene Harness Trace - ${html(scorecard.suite)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 1120px; padding: 32px 20px 64px; line-height: 1.5; }
    header, section { border: 1px solid #8b949e55; border-radius: 12px; margin: 0 0 20px; padding: 20px; }
    header h1, section h2 { margin-top: 0; }
    h2 span { float: right; font-size: 1.5em; }
    dl { display: grid; grid-template-columns: minmax(130px, 190px) 1fr; gap: 6px 16px; }
    dt { font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #8b949e55; padding: 9px; text-align: left; }
    code { overflow-wrap: anywhere; }
    .verdict-pass { border-left: 6px solid #2da44e; }
    .verdict-fail { border-left: 6px solid #cf222e; }
    .verdict-infra_error, .issues { border-left: 6px solid #bf8700; }
    .issues { background: #bf870015; margin: 16px 0; padding: 12px 16px; }
  </style>
</head>
<body>
  <header>
    <h1>Midscene Harness Trace</h1>
    <p><strong>${html(scorecard.suite)}</strong> · verdict <strong>${html(scorecard.verdict)}</strong> · Trace <strong>${html(scorecard.traceHealth.status)}</strong></p>
    <p>Run <code>${html(`${scorecard.provenance.runId}.${scorecard.provenance.runAttempt}`)}</code> · commit <code>${html(scorecard.provenance.gitSha || 'local')}</code> · model <code>${html(scorecard.provenance.model.name || 'not configured')}</code></p>
    ${scorecard.provenance.runUrl ? `<p><a href="${html(scorecard.provenance.runUrl)}">Open GitHub job logs</a></p>` : ''}
  </header>
  ${harnessIssues ? `<section class="issues"><h2>Harness issues</h2><ul>${harnessIssues}</ul></section>` : ''}
  ${caseCards || '<section><h2>No scored cases</h2></section>'}
  ${checkRows ? `<section><h2>Required checks</h2><table><thead><tr><th>Check</th><th>Kind</th><th>Outcome</th></tr></thead><tbody>${checkRows}</tbody></table></section>` : ''}
</body>
</html>
`;
}

export async function finalizeHarnessRun(options) {
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const suite = String(options.suite ?? '').trim();
  if (!suite) throw new Error('Harness suite is required');
  const stages = parseStages(options.stages);
  const environment = options.environment ?? process.env;
  const runId = environment.GITHUB_RUN_ID ?? 'local';
  const runAttempt = environment.GITHUB_RUN_ATTEMPT ?? '1';
  const outputDir = resolveWorkspacePath(
    workspace,
    options.outputDir ??
      path.join(
        'midscene_run',
        'harness',
        `${safeSegment(suite)}-${safeSegment(runId)}-${safeSegment(runAttempt)}`,
      ),
  );
  if (await exists(outputDir)) {
    throw new Error(`Harness output is immutable and already exists: ${outputDir}`);
  }
  await mkdir(outputDir, { recursive: true });

  const warnings = [];
  const reportDestinations = await copyRoots({
    workspace,
    roots: parseList(options.reportRoots),
    outputDir,
    category: 'reports',
    warnings,
  });
  await copyRoots({
    workspace,
    roots: parseList(options.evidenceRoots),
    outputDir,
    category: 'evidence',
    warnings,
  });
  await removeHiddenFiles(outputDir);

  const reportFiles = (
    await Promise.all(reportDestinations.map((root) => listFiles(root)))
  )
    .flat()
    .filter((file) => path.extname(file).toLowerCase() === '.html');
  const reports = [];
  for (const reportFile of reportFiles) {
    reports.push(await extractReport(reportFile, outputDir));
  }

  const harnessIssues = [];
  for (const report of reports) {
    if (report.parseErrors.length > 0) {
      harnessIssues.push(`Report ${report.path} contains invalid dump JSON`);
    }
  }

  const attemptId = `${runId}.${runAttempt}.${safeSegment(suite)}`;
  const runProvenance = provenance(environment, suite, stages);
  const cases = [];
  const checks = [];

  for (const stage of stages) {
    const matchingReports =
      stage.reportPatterns.length === 0
        ? reports
        : reports.filter((report) =>
            stage.reportPatterns.some((pattern) => reportMatches(report, pattern)),
          );
    const tasks = flattenTasks(matchingReports);
    const traceProblems = [];
    if (stage.traceRequired && stage.required && stage.outcome !== 'skipped') {
      for (const pattern of stage.reportPatterns) {
        if (!reports.some((report) => reportMatches(report, pattern))) {
          traceProblems.push(`required report pattern has no match: ${pattern}`);
        }
      }
      if (matchingReports.length === 0) traceProblems.push('no report was collected');
      if (tasks.length === 0) traceProblems.push('no Midscene task was found');
      if (tasks.some((task) => !task.taskId)) {
        traceProblems.push('one or more tasks are missing taskId');
      }
      if (!tasks.some((task) => task.modelCalls.length > 0)) {
        traceProblems.push('no model usage or request id was found');
      }
      if (!tasks.some((task) => task.evidence.rawResponse)) {
        traceProblems.push('no raw model response evidence was found');
      }
      if (
        !tasks.some(
          (task) => task.evidence.screenshot || task.evidence.recorder,
        )
      ) {
        traceProblems.push('no screenshot evidence was found');
      }
    }
    for (const problem of traceProblems) {
      harnessIssues.push(`Stage ${stage.id}: ${problem}`);
    }

    const { verdict, score } = stageVerdict(stage);
    const validator = {
      id: `${stage.id}-validator`,
      type: stage.validator.type,
      version: stageConfigHash(stage),
      expected: stage.validator.expected,
      observed: stage.outcome,
    };
    const result = {
      schemaVersion: 1,
      caseId: stage.id,
      name: stage.name,
      attemptId,
      verdict,
      score,
      stability:
        runProvenance.retryPolicy.modelRetryCount > 0
          ? 'retry_policy_enabled'
          : 'single_attempt',
      required: stage.required,
      outcome: stage.outcome,
      validator,
      trace: {
        complete: traceProblems.length === 0,
        problems: traceProblems,
        reports: matchingReports.map((report) => ({
          reportId: report.reportId,
          path: report.path,
          groupName: report.groupName,
          sdkVersion: report.sdkVersion,
          deviceType: report.deviceType,
          modelBriefs: report.modelBriefs,
        })),
        tasks,
      },
      provenance: runProvenance,
    };
    const files = await writeCaseFiles(outputDir, attemptId, result);
    result.files = files;
    if (stage.kind === 'case') cases.push(result);
    else {
      checks.push({
        id: stage.id,
        name: stage.name,
        kind: stage.kind,
        required: stage.required,
        outcome: stage.outcome,
        verdict,
        files,
      });
    }
  }

  const securityFindings = await removeFilesContainingSecrets(
    outputDir,
    environment,
  );
  for (const file of securityFindings) {
    harnessIssues.push(`Removed evidence containing a secret: ${file}`);
  }

  const verdict = aggregateVerdict(stages, harnessIssues);
  const scorecard = {
    schemaVersion: 1,
    scorecardId: `${attemptId}.${shortHash(runProvenance.suiteConfigHash)}`,
    suite,
    verdict,
    conclusion: verdict === 'pass' ? 'success' : 'failure',
    traceHealth: {
      status: harnessIssues.length === 0 ? 'complete' : 'incomplete',
      reportCount: reports.length,
      executionCount: reports.reduce(
        (total, report) => total + report.executions.length,
        0,
      ),
      taskCount: flattenTasks(reports).length,
    },
    cases,
    checks,
    harnessIssues,
    warnings,
    securityFindings,
    provenance: runProvenance,
  };

  const scorecardPath = path.join(outputDir, 'scorecard.json');
  const summaryPath = path.join(outputDir, 'summary.md');
  const traceIndexPath = path.join(outputDir, 'index.html');
  await writeFile(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  await writeFile(summaryPath, renderSummary(scorecard));
  await writeFile(traceIndexPath, renderTraceIndex(scorecard));
  const manifest = await buildManifest(outputDir);
  await writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  return {
    outputDir,
    scorecardPath,
    summaryPath,
    scorecard,
  };
}
