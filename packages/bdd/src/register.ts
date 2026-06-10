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
  Before,
  BeforeAll,
  BeforeStep,
  Given,
  setDefaultTimeout,
  setWorldConstructor,
} from '@cucumber/cucumber';
import { buildStepContext } from './annotations';
import { scanAssets } from './assets';
import { loadBddConfig } from './config';
import { runStep } from './router';
import { discoverSkills } from './skills';
import { ERROR_PREFIX } from './types';
import { MidsceneWorld, getRuntime, setRuntime } from './world';

/** AI steps (model round-trips + browser actions) are slow; allow 3 minutes. */
const DEFAULT_STEP_TIMEOUT_MS = 180_000;

setWorldConstructor(MidsceneWorld);
setDefaultTimeout(DEFAULT_STEP_TIMEOUT_MS);

BeforeAll(async () => {
  const config = await loadBddConfig();
  const { flows } = await scanAssets(config);
  const skills = await discoverSkills(
    resolve(config.baseDir, config.paths.skills),
  );
  setRuntime({ config, flows, skills });
});

// Fresh scenario scope; agents stay lazy (created on first UI/agent step).
Before(function (this: MidsceneWorld) {
  this.vars = new Map();
});

// Step definitions only receive captured text, so the hook stashes the full
// pickle context the catch-all needs (annotations, table, doc string).
BeforeStep(function (
  this: MidsceneWorld,
  { pickle, pickleStep, gherkinDocument },
) {
  this.currentStep = { pickle, pickleStep, gherkinDocument };
});

// THE catch-all — the only cucumber step definition in the system. cucumber
// checks function arity against the pattern's capture count, so the capture
// must be declared even though routing reads the full pickle step instead.
Given(/^(.*)$/s, async function (this: MidsceneWorld, _stepText: string) {
  const current = this.currentStep;
  if (!current) {
    throw new Error(
      `${ERROR_PREFIX} No current step recorded — the BeforeStep hook did not run; is @midscene/bdd/register the only support module registering hooks?`,
    );
  }

  const ctx = buildStepContext({
    document: current.gherkinDocument,
    pickle: current.pickle,
    pickleStep: current.pickleStep,
    vars: this.vars,
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
});

// Fresh browser per scenario = isolation. The Midscene report path is
// attached so it shows up next to the scenario in cucumber reports.
After(async function (this: MidsceneWorld) {
  const { reportFile } = await this.destroyAgents();
  if (reportFile) {
    await this.attach(`Midscene report: ${reportFile}`, 'text/plain');
  }
});
