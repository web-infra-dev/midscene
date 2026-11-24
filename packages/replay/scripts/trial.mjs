import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { withoutReplayFallback } from '../dist/es/experimental.mjs';
import {
  describeError,
  digest,
  imageBytes,
  writeJsonFile,
} from '../dist/es/tooling.mjs';
import { outsideDirectory, outsideRecording, readSource } from './evidence.mjs';
import {
  collectChecks,
  loadReplay,
  loadReplayFlow,
  partialChecksReason,
  resolveReplayEntry,
  uncheckedChecks,
} from './host.mjs';
import { trackModelRequests } from './metrics.mjs';
import { renderAgentReport } from './native-report.mjs';
import {
  exportReportEvidence,
  writeReviewSheets,
  writeStepIndex,
} from './report-evidence.mjs';

const importSpecifiers =
  /(?:(?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*)(['"])([^'"]+)\1/g;

function checkLocalImports(file, root, role) {
  if (!/\.[cm]?js$/.test(file)) return;
  const source = readFileSync(file, 'utf8').replace(
    /\/\*[\s\S]*?\*\/|(^|[^:\\])\/\/.*/gm,
    '$1',
  );
  for (const [, , specifier] of source.matchAll(importSpecifiers)) {
    const local =
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('file:') ||
      isAbsolute(specifier);
    if (!local) continue;
    const resolved = specifier.startsWith('file:')
      ? fileURLToPath(specifier)
      : resolve(dirname(file), specifier);
    const target = existsSync(resolved) ? realpathSync(resolved) : resolved;
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error(
        `TRIAL_IMPORT_OUTSIDE_ROOT: ${role} import ${specifier} from ${file} resolves outside ${root}`,
      );
    if (
      rel.split(sep).some((part) => part === 'node_modules' || part === '.git')
    )
      throw new Error(
        `TRIAL_IMPORT_EXCLUDED: ${role} import ${specifier} resolves to an excluded directory`,
      );
  }
}

/** Snapshot a delivery directory, or keep the historical single-entry scope. */
function replayFiles(entry, bundle) {
  const files = [entry];
  const root = dirname(entry);
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const path = join(dir, item.name);
      if (bundle && item.isSymbolicLink())
        throw new Error(`REPLAY_INPUT_SYMLINK: ${relative(root, path)}`);
      if (path === entry) continue;
      if (item.isDirectory()) walk(path);
      else if (bundle ? item.isFile() : /\.m?js$/.test(item.name))
        files.push(path);
    }
  };
  walk(bundle ? root : join(root, 'steps'));
  return files.sort();
}

/** Next WORKSPACE/trials/NN directory of a prepared authoring workspace. */
function nextTrialDir(workspace) {
  const parent = join(workspace, 'trials');
  mkdirSync(parent, { recursive: true });
  const last = readdirSync(parent)
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .reduce((a, b) => Math.max(a, b), 0);
  return join(parent, String(last + 1).padStart(2, '0'));
}

/**
 * Execute and retain evidence. Business equivalence is reviewed by the coding Agent.
 * @param {string} script
 * @param {{
 *   session?: string,
 *   cdp?: string,
 *   reuseTab?: boolean,
 *   source?: string,
 *   out?: string,
 *   runs?: number,
 *   headless?: boolean,
 *   allowFallback?: boolean,
 *   step?: string,
 * }} options
 * @returns {Promise<{
 *   execution: 'passed',
 *   snapshotScope: 'replay-directory' | 'entry-and-steps',
 *   completedRuns: number,
 *   steps: {id: string, number: number, title: string, retry: string, optional: boolean}[],
 *   inputs: {file: string, path: string, sha256: string}[],
 *   inputDigest: string,
 * }>}
 */
export async function trial(
  script,
  {
    session: sessionFile,
    cdp,
    reuseTab = false,
    source: sourceFile,
    out,
    runs = 3,
    headless,
    allowFallback = false,
    step: focus,
  },
) {
  if (!Number.isSafeInteger(runs) || runs < 1)
    throw new Error('Expected positive integer --runs');
  if (allowFallback && runs !== 1)
    throw new Error('--allow-fallback requires --runs 1 (diagnostics only)');
  if (reuseTab && (!cdp || sessionFile))
    throw new Error('--reuse-tab requires trial --cdp and excludes --session');
  script = resolveReplayEntry(resolve(script));
  const bundle = basename(script) === 'index.mjs';
  const root = realpathSync(dirname(script));
  script = join(root, basename(script));
  if (sessionFile) sessionFile = realpathSync(sessionFile);
  const roots = {
    replay: root,
    ...(sessionFile ? { session: dirname(sessionFile) } : {}),
  };
  // A prepared workspace holds source.json beside the script or its folder.
  sourceFile ??= [dirname(script), dirname(dirname(script))]
    .map((dir) => join(dir, 'source.json'))
    .find((file) => existsSync(file));
  const source = sourceFile ? readSource(sourceFile) : undefined;
  const verifyOutput = (destination) => {
    if (source) outsideRecording(source.root, destination);
    if (bundle) outsideDirectory(root, destination, 'replay bundle');
  };
  if (out) {
    verifyOutput(out);
    mkdirSync(dirname(out), { recursive: true });
    mkdirSync(out);
  } else if (source) {
    verifyOutput(join(dirname(sourceFile), 'trials'));
    out = nextTrialDir(dirname(sourceFile));
    mkdirSync(out);
  } else {
    const parent = getMidsceneRunSubDir('test-results');
    verifyOutput(parent);
    out = mkdtempSync(join(parent, 'replay-trial-'));
  }
  const result = {
    at: new Date().toISOString(),
    directory: out,
    snapshotScope: bundle ? 'replay-directory' : 'entry-and-steps',
    ...(source ? { recording: source.root, source: source.source } : {}),
    execution: 'failed',
    mode: focus !== undefined ? 'focus' : runs < 3 ? 'diagnostic' : 'strict',
    ...(focus !== undefined ? { focus } : {}),
    fallbackAllowed: allowFallback,
    requestedRuns: runs,
    completedRuns: 0,
    reports: [],
    errors: [],
  };
  let replayInventory;
  let replay;
  const captured = new Map();
  const snapshot = (role, file) => {
    const path = `${role}/${relative(roots[role], file).split(sep).join('/')}`;
    if (captured.has(path)) return;
    if (result.completedRuns)
      throw new Error(
        `TRIAL_INPUTS_CHANGED: new module after the first run: ${path}`,
      );
    const bytes = readFileSync(file);
    const target = join(out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    captured.set(path, { file, path, sha256: digest(bytes) });
  };
  const unchanged = () => {
    try {
      const files = replayFiles(script, bundle);
      if (
        files.length === replayInventory.length &&
        files.every((file, index) => file === replayInventory[index]) &&
        [...captured.values()].every(
          ({ file, sha256 }) => digest(readFileSync(file)) === sha256,
        )
      )
        return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    throw new Error(
      'TRIAL_INPUTS_CHANGED: replay files or session differ from the trial snapshot',
    );
  };
  const trialId = randomUUID();
  const importEntry = (file) => {
    const entry = pathToFileURL(file);
    entry.searchParams.set('midscene-replay-trial', trialId);
    return import(entry.href);
  };
  try {
    if (realpathSync(script) !== script)
      throw new Error(`REPLAY_INPUT_SYMLINK: ${script}`);
    replayInventory = replayFiles(script, bundle);
    for (const file of replayInventory) {
      checkLocalImports(file, roots.replay, 'replay');
      snapshot('replay', file);
    }
    if (sessionFile) {
      checkLocalImports(sessionFile, roots.session, 'session');
      snapshot('session', sessionFile);
    }
    unchanged();
    const flow = await loadReplayFlow(script, importEntry);
    replay = await loadReplay(flow, {
      sessionFile,
      cdp,
      isolate: !reuseTab,
      reuseTab,
      headless,
      generateReport: false,
      importEntry,
    });
    const hostModule = replay.session;
    result.host = {
      ...replay.hostConfig,
      startUrl: replay.flow.meta.startUrl,
    };
    // The snapshot identifies the bundle. Steps keep their business identity.
    result.steps = replay.flow.steps.map((step, index) => ({
      number: index + 1,
      id: step.id,
      title: step.title,
      retry: step.retry,
      optional: !!step.optional,
    }));
    for (let index = 1; index <= runs; index++) {
      const dir = join(out, `run-${index}`);
      mkdirSync(dir);
      const report = {
        index,
        execution: 'failed',
        events: [],
        fallbacks: [],
        heal: [],
        scriptCompleted: false,
        errors: [],
        checks: uncheckedChecks(hostModule),
      };
      const stream = channel('midscene.replay');
      const metrics = trackModelRequests();
      let host;
      let listener;
      let stage = 'session-open';
      const started = performance.now();
      const capture = async (name) => {
        const file = `${name}.png`;
        writeFileSync(
          join(dir, file),
          imageBytes(await host.agent.interface.screenshotBase64()),
        );
        report[name] = {
          image: file,
          url: host.agent.interface.underlyingPage.url(),
        };
      };
      try {
        unchanged();
        host = await hostModule.open({ outDir: dir });
        const { agent, params } = await replay.prepare(host, (phase) => {
          stage = phase;
        });
        stage = 'start-evidence';
        const page = agent.interface.underlyingPage;
        report.viewport = page.viewportSize?.() ?? page.viewport?.();
        await capture('start');
        listener = (message) => {
          if (message.agent !== agent) return;
          const event = { ...message.event };
          if (event.type === 'step')
            event.executionIndex = agent.dump?.executions?.length;
          if (event.type === 'fallback') report.fallbacks.push(event);
          if (event.type === 'heal') report.heal.push(event);
          if (event.type === 'evidence-error') report.errors.push(event.error);
          if (message.screenshot) {
            event.image = `event-${report.events.length}.jpg`;
            writeFileSync(
              join(dir, event.image),
              imageBytes(message.screenshot),
            );
          }
          report.events.push(event);
        };
        stream.subscribe(listener);
        report.setupMs = Math.round(performance.now() - started);
        stage = metrics.phase = 'script';
        const scriptStart = performance.now();
        try {
          const execute = () =>
            replay.flow.run(agent, {
              params,
              ...(focus !== undefined ? { until: focus } : {}),
            });
          try {
            report.flow = await (allowFallback
              ? execute()
              : withoutReplayFallback(execute));
          } catch (error) {
            if (error?.outcome) report.flow = error.outcome;
            throw error;
          }
          report.retries = report.flow.steps.reduce(
            (total, step) => total + Math.max(0, step.attempts.length - 1),
            0,
          );
          report.scriptCompleted = true;
          if (!allowFallback && report.fallbacks.length)
            throw new Error('FALLBACK_IN_STRICT_TRIAL');
        } finally {
          report.scriptMs = Math.round(performance.now() - scriptStart);
        }
        stage = metrics.phase = 'checks';
        const checkStart = performance.now();
        // Final host checks describe the whole flow, not a focused step.
        report.checks =
          focus !== undefined
            ? uncheckedChecks(hostModule, partialChecksReason)
            : await collectChecks(hostModule, agent, params);
        report.checksMs = Math.round(performance.now() - checkStart);
        unchanged();
        if (
          focus !== undefined ||
          report.checks.every((check) => check.state === 'pass')
        )
          report.execution = 'passed';
      } catch (error) {
        report.errors.push(describeError(error, stage));
      } finally {
        if (listener) stream.unsubscribe(listener);
        metrics.phase = 'evidence';
        let serializedReport;
        if (host?.agent) {
          // Preserve native Midscene actions, actual screenshots and checkpoints before teardown.
          try {
            const dump = host.agent.dumpDataString({ inlineScreenshots: true });
            writeFileSync(join(dir, 'agent.json'), dump);
            serializedReport = dump;
            report.agentReport = 'agent.json';
            report.evidence = exportReportEvidence(JSON.parse(dump), dir);
          } catch (error) {
            report.errors.push(describeError(error, 'report'));
          }
          try {
            await capture('terminal');
          } catch (error) {
            report.errors.push(describeError(error, 'capture'));
          }
        }
        metrics.phase = 'cleanup';
        try {
          await host?.close?.();
        } catch (error) {
          report.errors.push(describeError(error, 'cleanup'));
        }
        metrics.stop();
        report.requests = metrics.requests;
        if (serializedReport) {
          try {
            await renderAgentReport(serializedReport, join(dir, 'report.html'));
            report.reportHtml = 'report.html';
          } catch (error) {
            report.reportHtmlError = describeError(error, 'report-html');
          }
        }
        if (report.errors.length) report.execution = 'failed';
        writeJsonFile(join(dir, 'report.json'), report);
      }
      result.reports.push({
        ...report,
        events: undefined,
        evidence: report.evidence && { images: report.evidence.images },
        report: `run-${index}/report.json`,
      });
      result.completedRuns++;
      if (report.execution !== 'passed') break;
    }
    unchanged();
    if (sourceFile) readSource(sourceFile);
  } catch (error) {
    result.errors.push(describeError(error, 'trial'));
  } finally {
    try {
      await replay?.dispose();
    } catch (error) {
      result.errors.push(describeError(error, 'cleanup'));
    }
  }
  result.inputs = [...captured.keys()].sort().map((path) => captured.get(path));
  result.inputDigest = digest(
    Buffer.from(
      JSON.stringify(result.inputs.map(({ path, sha256 }) => [path, sha256])),
    ),
  );
  // Locator repair hints: recovered fallbacks and strict-run guard matches.
  const heal = result.reports.flatMap((report) =>
    [...(report.fallbacks ?? []), ...(report.heal ?? [])].map((event) => ({
      run: report.index,
      step: event.step,
      prompt: event.prompt,
      type: event.type,
      original: event.original?.code ?? event.original,
      result: event.result,
      resolvedBy: event.resolvedBy,
      suggestions: event.suggestions ?? [],
      error: event.error ?? event.reason,
    })),
  );
  if (heal.length) {
    writeJsonFile(join(out, 'heal.json'), heal);
    result.heal = 'heal.json';
  }
  try {
    const acceptance = sourceFile && join(dirname(sourceFile), 'acceptance.md');
    const steps = writeStepIndex(result.reports, out, result.steps ?? [], {
      acceptance:
        acceptance && existsSync(acceptance)
          ? relative(realpathSync(out), realpathSync(acceptance))
              .split(sep)
              .map(encodeURIComponent)
              .join('/')
          : undefined,
      heal: result.heal,
      host: result.host,
    });
    result.stepIndex = 'steps.md';
    result.reviewSheets = await writeReviewSheets(steps, out);
  } catch (error) {
    result.errors.push(describeError(error, 'evidence'));
  }
  result.execution =
    result.completedRuns === runs &&
    result.reports.every((r) => r.execution === 'passed') &&
    !result.errors.length
      ? 'passed'
      : 'failed';
  writeJsonFile(join(out, 'result.json'), result);
  if (result.execution !== 'passed')
    throw new Error(
      [
        'TRIAL_FAILED',
        ...result.errors.map((error) => error.message),
        ...result.reports.flatMap((report) => [
          ...report.errors.map((error) => error.message),
          ...report.checks
            .filter((check) => check.state !== 'pass')
            .map((check) => `${check.name}: ${check.state}`),
        ]),
        `Inspect ${join(out, 'result.json')}`,
      ].join('\n'),
    );
  return result;
}
