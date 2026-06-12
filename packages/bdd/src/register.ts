/**
 * Cucumber support entry for @midscene/bdd — a pure side-effect module users
 * list in their cucumber `import:` (or `require:`) configuration.
 *
 * Wiring: one BeforeAll loads config/flows/skills into the per-worker
 * runtime; one catch-all step definition intercepts every Gherkin statement
 * (cucumber matching is keyword-agnostic, so Given/When/Then/And/But all land
 * here) and hands a RouterContext to `runStep`. Users never register raw
 * cucumber steps — classic callbacks go through @midscene/bdd's no-ai
 * registry instead.
 *
 * No top-level awaits: the module must stay loadable from the CJS build.
 */
import { resolve } from 'node:path';
import {
  After,
  AfterAll,
  BeforeAll,
  BeforeStep,
  Given,
  setDefaultTimeout,
  setWorldConstructor,
} from '@cucumber/cucumber';
import { getDebug } from '@midscene/shared/logger';
import { buildStepContext } from './annotations';
import { scanAssets } from './assets';
import { loadBddConfig } from './config';
import { runStep } from './router';
import { discoverSkills } from './skills';
import { ERROR_PREFIX } from './types';
import {
  MidsceneWorld,
  cleanupError,
  destroyWorkerUiAgent,
  getRuntime,
  setRuntime,
} from './world';

/** AI steps (model round-trips + browser actions) are slow; allow 3 minutes. */
const DEFAULT_STEP_TIMEOUT_MS = 180_000;

setWorldConstructor(MidsceneWorld);
setDefaultTimeout(DEFAULT_STEP_TIMEOUT_MS);

BeforeAll(async () => {
  const config = await loadBddConfig();
  const { flows, files } = await scanAssets(config);
  const skills = await discoverSkills(
    resolve(config.baseDir, config.paths.skills),
  );
  setRuntime({ config, flows, skills, scannedFiles: files });
});

// Flows are registered only from config.paths.features. When cucumber runs a
// feature outside those globs (e.g. a positional CLI path), flow calls in it
// would silently fall through to the UI agent — warn loudly, once per file.
const unscannedWarned = new Set<string>();

function warnIfUnscanned(uri: string | undefined): void {
  if (!uri || unscannedWarned.has(uri)) return;
  const { config, scannedFiles } = getRuntime();
  if (!scannedFiles) return;
  const absolute = resolve(process.cwd(), uri);
  if (scannedFiles.includes(absolute)) return;
  unscannedWarned.add(uri);
  const warn = getDebug('bdd:register', { console: true });
  warn(
    `feature ${uri} is outside the flow-scan globs (config.paths.features: ${config.paths.features.join(', ')}); flows defined there are not registered and flow calls may silently route to the UI agent`,
  );
}

// Step definitions only receive captured text, so the hook stashes the full
// pickle context the catch-all needs (annotations, table, doc string).
// `currentStepHasArgument` is module-level (safe: scenarios run serially
// within a cucumber worker) and drives the catch-all's dynamic arity below.
let currentStepHasArgument = false;

BeforeStep(function (
  this: MidsceneWorld,
  { pickle, pickleStep, gherkinDocument },
) {
  this.currentStep = { pickle, pickleStep, gherkinDocument };
  currentStepHasArgument = pickleStep.argument !== undefined;
  warnIfUnscanned(gherkinDocument.uri);
});

// THE catch-all — the only cucumber step definition in the system. cucumber
// validates the function's arity per step: 1 parameter for the regex capture,
// plus 1 when the step carries a data table / doc string (declaring one more
// than that flips cucumber into callback mode, which rejects async functions).
// No static arity satisfies both shapes, so the function uses rest args
// (natural length 0) and exposes a dynamic `length` driven by the BeforeStep
// hook, which cucumber reads at invocation time.
const catchAllStep = async function (this: MidsceneWorld, ..._args: unknown[]) {
  const current = this.currentStep;
  if (!current) {
    throw new Error(
      `${ERROR_PREFIX} No current step recorded — the BeforeStep hook did not run; is @midscene/bdd/register the only support module registering hooks?`,
    );
  }

  // The catch-all only ever sees top-level pickles (flow bodies run through
  // executeFlow), so a @flow tag here means the scenario is executing
  // STANDALONE — its <param> placeholders would go to the vision model
  // verbatim. That is never intended; the profile preset filters flows out
  // (`tags: 'not @flow'`), so a user-supplied cucumber config dropped it.
  if (current.pickle.tags?.some((tag) => tag.name === '@flow')) {
    throw new Error(
      `${ERROR_PREFIX} Scenario "${current.pickle.name}" is tagged @flow — flows are reusable sub-procedures and must never run standalone (their <param> placeholders would reach the model unsubstituted). Exclude them with tags: 'not @flow' in your cucumber config, or use the @midscene/bdd/profile preset which does this for you.`,
    );
  }

  const ctx = buildStepContext({
    document: current.gherkinDocument,
    pickle: current.pickle,
    pickleStep: current.pickleStep,
    flowDepth: 0,
    runtime: getRuntime(),
    agents: {
      getUiAgent: () => this.getUiAgent(),
      getGeneralAgent: () => this.getGeneralAgent(),
      peekUiAgent: () => this.peekUiAgent(),
    },
    attach: this.attach.bind(this),
    log: this.log.bind(this),
  });

  await runStep(ctx);
};

// Function `length` is configurable, so a getter can report the arity
// cucumber expects for the step about to run.
Object.defineProperty(catchAllStep, 'length', {
  get: () => (currentStepHasArgument ? 2 : 1),
});

Given(/^(.*)$/s, catchAllStep);

// Fresh browser per scenario = isolation (under `uiAgent.scope: 'worker'`
// the UI agent is kept and only the general agent is dropped). The Midscene
// report path is attached so it shows up next to the scenario in cucumber
// reports — even when teardown failed, which is exactly when the report
// matters most.
After(async function (this: MidsceneWorld) {
  const { reportFile, errors } = await this.destroyAgents();
  if (reportFile) {
    await this.attach(`Midscene report: ${reportFile}`, 'text/plain');
  }
  if (errors.length > 0) {
    throw cleanupError(errors);
  }
});

// `scope: 'worker'` agents live across scenarios; tear them down when the
// worker finishes. No-op under the default per-scenario scope.
AfterAll(async () => {
  const { errors } = await destroyWorkerUiAgent();
  if (errors.length > 0) {
    throw cleanupError(errors);
  }
});
