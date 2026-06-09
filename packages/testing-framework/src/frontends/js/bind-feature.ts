import type {
  CallFlowStepIR,
  FlowIRStep,
  ScenarioConfigIR,
  ScenarioIR,
} from '../../flow-ir';
import { assertIdentifier } from '../../flow-ir';
/**
 * POC: hybrid authoring mode — `bindFeature(featurePathOrSource, overlay)`.
 *
 * Inspired by jest-cucumber's inverted model, with one deliberate inversion of
 * its inversion: jest-cucumber requires every step to be restated in JS
 * because steps need somewhere to put code. AI execution removes that need,
 * so the overlay here is SPARSE — the `.feature` file stays the source of
 * truth, scenarios/steps not mentioned in the overlay run as pure Gherkin,
 * and JS only attaches where it adds something:
 *
 *  - override an anchored step's prompt template or node kind;
 *  - inject computed variables into the scenario's variable table, or extra
 *    args into an anchored flow call;
 *  - insert extra IR steps before/after an anchored step;
 *  - attach per-scenario runner config (skip/only) at the IR level.
 *
 * Binding glue is title + anchor (exact step text or index), and drift is
 * validated at bind time with jest-cucumber-style errors: closest matches
 * plus a ready-to-paste corrected overlay snippet.
 */
import type { BuiltinNodeType } from '../../types';
import {
  type CompiledFeature,
  compileFeature,
  compileFeatureFile,
} from '../gherkin';
import { type StepInput, When } from './index';

/** Anchor a step by its exact text (see {@link anchorText}) or its index. */
export type StepAnchor = string | number;

export interface StepOverlay {
  /**
   * Which step this overlay binds to. Text anchors match the step's
   * "anchor text": the prompt template for prompt steps, the capture
   * description for `remember` steps, and the flow name for flow calls.
   */
  at: StepAnchor;
  /** Override the step's natural-language template (prompt/capture steps). */
  template?: string;
  /** Override the node kind (prompt steps only), e.g. verify → soft. */
  node?: BuiltinNodeType;
  /** Merge computed args into an anchored flow call. */
  args?: Record<string, string | number | boolean>;
  /** Extra steps inserted before/after the anchored step. */
  before?: StepInput[];
  after?: StepInput[];
}

export interface ScenarioOverlay {
  /** Computed variables injected into the scenario's variable table. */
  vars?: Record<string, string | number | boolean>;
  steps?: StepOverlay[];
  /** Runner-facing flags, attached to the IR as `scenario.config`. */
  skip?: boolean;
  only?: boolean;
}

export interface FeatureOverlay {
  /** Keyed by scenario title. Unmentioned scenarios run as pure Gherkin. */
  scenarios?: Record<string, ScenarioOverlay>;
}

/**
 * Compile a `.feature` (path or inline source — sources are detected by
 * containing a newline) and apply a sparse JS overlay. Throws at bind time on
 * any drift between the overlay and the feature.
 */
export function bindFeature(
  featurePathOrSource: string,
  overlay: FeatureOverlay = {},
): CompiledFeature {
  const isSource = featurePathOrSource.includes('\n');
  const uri = isSource ? '<inline>' : featurePathOrSource;
  const compiled = isSource
    ? compileFeature(featurePathOrSource, uri)
    : compileFeatureFile(featurePathOrSource);

  const overlays = overlay.scenarios ?? {};
  const titles = new Set(compiled.scenarios.map((s) => s.name));

  for (const title of Object.keys(overlays)) {
    if (!titles.has(title)) {
      throw unknownScenarioError(title, compiled, uri);
    }
  }

  // A title may expand to several scenarios (Scenario Outline); the overlay
  // applies to every expansion.
  const scenarios = compiled.scenarios.map((s) => {
    const scenarioOverlay = overlays[s.name];
    return scenarioOverlay ? applyScenarioOverlay(s, scenarioOverlay, uri) : s;
  });

  return { ...compiled, scenarios };
}

/** The text a step overlay's `at:` anchor is matched against. */
export function anchorText(step: FlowIRStep): string {
  switch (step.kind) {
    case 'prompt':
    case 'capture':
      return step.template;
    case 'callFlow':
      return step.flowName;
  }
}

// ———————————————————————— overlay application ————————————————————————

function applyScenarioOverlay(
  scenario: ScenarioIR,
  overlay: ScenarioOverlay,
  uri: string,
): ScenarioIR {
  const where = `bindFeature(${uri}): scenario "${scenario.name}"`;

  interface Patch {
    overlays: StepOverlay[];
    before: FlowIRStep[];
    after: FlowIRStep[];
  }
  const patches = new Map<number, Patch>();

  for (const stepOverlay of overlay.steps ?? []) {
    // All anchors resolve against the ORIGINAL step list, so several
    // overlays never shift each other's positions.
    const index = resolveAnchor(stepOverlay.at, scenario, uri);
    validateStepOverlay(stepOverlay, scenario.steps[index], index, where);

    const patch = patches.get(index) ?? {
      overlays: [],
      before: [],
      after: [],
    };
    patch.overlays.push(stepOverlay);
    patch.before.push(...normalizeInserts(stepOverlay.before));
    patch.after.push(...normalizeInserts(stepOverlay.after));
    patches.set(index, patch);
  }

  const steps: FlowIRStep[] = [];
  for (let i = 0; i < scenario.steps.length; i++) {
    const patch = patches.get(i);
    if (!patch) {
      steps.push(scenario.steps[i]);
      continue;
    }
    steps.push(...patch.before);
    steps.push(patch.overlays.reduce(patchStep, scenario.steps[i]));
    steps.push(...patch.after);
  }

  const result: ScenarioIR = { ...scenario, steps };

  if (overlay.vars) {
    const vars: Record<string, string> = { ...scenario.vars };
    for (const [key, value] of Object.entries(overlay.vars)) {
      assertIdentifier(key, `${where} overlay vars`);
      vars[key] = String(value);
    }
    result.vars = vars;
  }

  if (overlay.skip !== undefined || overlay.only !== undefined) {
    const config: ScenarioConfigIR = {};
    if (overlay.skip !== undefined) config.skip = overlay.skip;
    if (overlay.only !== undefined) config.only = overlay.only;
    result.config = config;
  }

  return result;
}

function patchStep(step: FlowIRStep, overlay: StepOverlay): FlowIRStep {
  switch (step.kind) {
    case 'prompt':
      return {
        ...step,
        template: overlay.template ?? step.template,
        node: overlay.node ?? step.node,
      };
    case 'capture':
      return { ...step, template: overlay.template ?? step.template };
    case 'callFlow':
      return overlay.args
        ? { ...step, args: { ...step.args, ...stringifyArgs(overlay.args) } }
        : step;
  }
}

function normalizeInserts(inserts: StepInput[] | undefined): FlowIRStep[] {
  return (inserts ?? []).map((s) => (typeof s === 'string' ? When(s) : s));
}

function stringifyArgs(
  args: Record<string, string | number | boolean>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    assertIdentifier(key, 'bindFeature overlay args');
    out[key] = String(value);
  }
  return out;
}

// ——————————————————— bind-time drift validation ———————————————————

function resolveAnchor(
  anchor: StepAnchor,
  scenario: ScenarioIR,
  uri: string,
): number {
  const where = `bindFeature(${uri}): scenario "${scenario.name}"`;

  if (typeof anchor === 'number') {
    if (
      !Number.isInteger(anchor) ||
      anchor < 0 ||
      anchor >= scenario.steps.length
    ) {
      throw new Error(
        `[midscene] ${where}: step anchor ${anchor} is out of range (the scenario has ${scenario.steps.length} steps, indices 0–${scenario.steps.length - 1}).\n\n${anchorListing(scenario)}`,
      );
    }
    return anchor;
  }

  const matches: number[] = [];
  scenario.steps.forEach((step, i) => {
    if (anchorText(step) === anchor) matches.push(i);
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const byIndex = matches
      .map((i) => `  { at: ${i} },  // ${describeStep(scenario.steps[i])}`)
      .join('\n');
    throw new Error(
      `[midscene] ${where}: step anchor ${JSON.stringify(anchor)} is ambiguous (matches steps ${matches.join(', ')}). Anchor by index instead:\n\n${byIndex}`,
    );
  }

  const closest = closestMatch(
    anchor,
    scenario.steps.map((s) => anchorText(s)),
  );
  const hint = closest ? `Did you mean ${JSON.stringify(closest)}?\n\n` : '';
  throw new Error(
    `[midscene] ${where}: no step matches anchor ${JSON.stringify(anchor)}. ${hint}${anchorListing(scenario)}`,
  );
}

function validateStepOverlay(
  overlay: StepOverlay,
  step: FlowIRStep,
  index: number,
  where: string,
): void {
  const target = `step ${index} (${describeStep(step)})`;
  if (overlay.node !== undefined && step.kind !== 'prompt') {
    throw new Error(
      `[midscene] ${where}: \`node\` can only override prompt steps, but ${target} is a ${step.kind} step.`,
    );
  }
  if (overlay.template !== undefined && step.kind === 'callFlow') {
    throw new Error(
      `[midscene] ${where}: \`template\` cannot override ${target}; use \`args\` to adjust a flow call.`,
    );
  }
  if (overlay.args !== undefined && step.kind !== 'callFlow') {
    throw new Error(
      `[midscene] ${where}: \`args\` only applies to flow-call steps, but ${target} is a ${step.kind} step.`,
    );
  }
}

function unknownScenarioError(
  title: string,
  compiled: CompiledFeature,
  uri: string,
): Error {
  const head = `[midscene] bindFeature(${uri}): overlay references unknown scenario ${JSON.stringify(title)}.`;

  // A common drift: targeting a @flow definition, which is not a runnable
  // scenario and cannot be overlaid.
  if (compiled.flows.some((f) => f.name === title)) {
    return new Error(
      `${head} ${JSON.stringify(title)} is a @flow definition; overlays only target runnable scenarios.`,
    );
  }

  const titles = [...new Set(compiled.scenarios.map((s) => s.name))];
  const closest = closestMatch(title, titles);
  const hint = closest ? `Did you mean ${JSON.stringify(closest)}?\n` : '';
  const snippetFor = closest
    ? compiled.scenarios.find((s) => s.name === closest)
    : compiled.scenarios[0];

  return new Error(
    `${head}\n${hint}Scenario titles in this feature: ${titles.map((t) => JSON.stringify(t)).join(', ')}.\n\nStarter overlay:\n\n${snippetFor ? overlaySnippet(snippetFor) : '(the feature has no runnable scenarios)'}`,
  );
}

// ————————————————————— codegen for error messages —————————————————————

/** Ready-to-paste overlay skeleton for one scenario (jest-cucumber style). */
function overlaySnippet(scenario: ScenarioIR): string {
  const lines: string[] = [];
  lines.push('scenarios: {');
  lines.push(`  ${JSON.stringify(scenario.name)}: {`);
  lines.push('    steps: [');
  scenario.steps.forEach((step, i) => {
    lines.push(
      `      { at: ${JSON.stringify(anchorText(step))} },  // ${i}: ${describeStep(step)}`,
    );
  });
  lines.push('    ],');
  lines.push('  },');
  lines.push('},');
  return lines.join('\n');
}

function anchorListing(scenario: ScenarioIR): string {
  return `Available anchors:\n\n${overlaySnippet(scenario)}`;
}

function describeStep(step: FlowIRStep): string {
  switch (step.kind) {
    case 'prompt':
      return `${step.node} node`;
    case 'capture':
      return `capture → {${step.varName}}`;
    case 'callFlow':
      return `flow call ${formatCallShort(step)}`;
  }
}

function formatCallShort(step: CallFlowStepIR): string {
  return `${step.flowName}(${Object.keys(step.args).join(', ')})`;
}

function closestMatch(needle: string, haystack: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of haystack) {
    const distance = levenshtein(needle.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Only suggest when reasonably close (less than half the title differs).
  if (best && bestDistance <= Math.max(needle.length, best.length) / 2) {
    return best;
  }
  return undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}
