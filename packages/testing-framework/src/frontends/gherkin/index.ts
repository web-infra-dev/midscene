/**
 * POC: Gherkin authoring front-end over the shared flow-IR.
 *
 * `.feature` files are parsed with `@cucumber/gherkin` and compiled through
 * its pickles API — Scenario Outline expansion (example values substituted
 * into step text), Background merging (leading steps) and tag inheritance all
 * come for free. Each pickle is then compiled to the same {@link ScenarioIR}
 * the JS front-end produces.
 *
 * Keyword→policy mapping (pickle step types already resolve And/But to the
 * last primary keyword):
 *  - Given (Context)  → ui node, setup semantics
 *  - When  (Action)   → ui node, action
 *  - Then  (Outcome)  → verify node (fail-closed), or soft when the scenario
 *    carries the `@soft` tag
 *  - `*`   (Unknown)  → ui node, action
 *
 * Step conventions:
 *  - `I remember <description> as "varName"` → variable capture
 *  - `I run the "FlowName" flow with arg "value" and other "value"` → flow
 *    invocation
 *
 * Flow definitions: a Scenario tagged `@flow` is registered as a named flow
 * instead of a runnable scenario. Params and returns are declared as tags:
 * `@param:role`, `@returns:greeting`.
 */
import { readFileSync } from 'node:fs';
import {
  AstBuilder,
  GherkinClassicTokenMatcher,
  Parser,
  compile,
} from '@cucumber/gherkin';
import {
  type GherkinDocument,
  IdGenerator,
  type Pickle,
  type PickleStep,
  PickleStepType,
} from '@cucumber/messages';
import type {
  FlowDefIR,
  FlowIRStep,
  PromptStepIR,
  ScenarioIR,
} from '../../flow-ir';
import { assertIdentifier } from '../../flow-ir';

export interface CompiledFeature {
  name: string;
  /** Runnable scenarios (everything not tagged `@flow`). */
  scenarios: ScenarioIR[];
  /** Flow definitions (scenarios tagged `@flow`), ready for a FlowRegistry. */
  flows: FlowDefIR[];
}

const REMEMBER_STEP = /^I remember (.+?) as "([A-Za-z_][A-Za-z0-9_]*)"$/i;
const CALL_FLOW_STEP = /^I run the "([^"]+)" flow(?: with (.+))?$/i;
const CALL_FLOW_ARG = /([A-Za-z_][A-Za-z0-9_]*)\s+"([^"]*)"/g;
const PARAM_TAG = /^@param:([A-Za-z_][A-Za-z0-9_]*)$/;
const RETURNS_TAG = /^@returns?:([A-Za-z_][A-Za-z0-9_]*)$/;

/** Compile Gherkin source text into IR scenarios and flow definitions. */
export function compileFeature(
  source: string,
  uri = '<inline>',
): CompiledFeature {
  const newId = IdGenerator.uuid();
  const parser = new Parser(
    new AstBuilder(newId),
    new GherkinClassicTokenMatcher(),
  );

  let pickles: readonly Pickle[];
  let featureName: string;
  let backgroundStepIds: Set<string>;
  try {
    const document = parser.parse(source);
    featureName = document.feature?.name ?? uri;
    backgroundStepIds = collectBackgroundStepIds(document);
    pickles = compile(document, uri, newId);
  } catch (err) {
    throw new Error(
      `[midscene] Failed to parse Gherkin in ${uri}: ${(err as Error).message}`,
    );
  }

  const scenarios: ScenarioIR[] = [];
  const flows: FlowDefIR[] = [];

  for (const pickle of pickles) {
    const tags = pickle.tags.map((t) => t.name);
    if (tags.includes('@flow')) {
      flows.push(compileFlowDef(pickle, tags, uri, backgroundStepIds));
    } else {
      scenarios.push(compileScenario(pickle, tags, uri));
    }
  }

  return { name: featureName, scenarios, flows };
}

/** Convenience wrapper: read and compile a `.feature` file. */
export function compileFeatureFile(file: string): CompiledFeature {
  return compileFeature(readFileSync(file, 'utf-8'), file);
}

function compileScenario(
  pickle: Pickle,
  tags: string[],
  uri: string,
): ScenarioIR {
  const isSoft = tags.includes('@soft');
  return {
    name: pickle.name,
    steps: pickle.steps.map((step) =>
      compileStep(step, { isSoft, where: `${uri}: "${pickle.name}"` }),
    ),
    tags,
  };
}

function compileFlowDef(
  pickle: Pickle,
  tags: string[],
  uri: string,
  backgroundStepIds: Set<string>,
): FlowDefIR {
  const where = `${uri}: flow "${pickle.name}"`;
  const params: string[] = [];
  const returns: string[] = [];
  for (const tag of tags) {
    const param = PARAM_TAG.exec(tag);
    if (param) params.push(param[1]);
    const ret = RETURNS_TAG.exec(tag);
    if (ret) returns.push(ret[1]);
  }
  const isSoft = tags.includes('@soft');
  // Background steps belong to runnable scenarios, not to reusable flows:
  // a flow invoked mid-scenario must not replay the feature's setup.
  const steps = pickle.steps.filter(
    (step) => !step.astNodeIds.some((id) => backgroundStepIds.has(id)),
  );
  return {
    name: pickle.name,
    params,
    returns,
    steps: steps.map((step) => compileStep(step, { isSoft, where })),
  };
}

/** IDs of all Background steps (feature-level and inside Rules). */
function collectBackgroundStepIds(document: GherkinDocument): Set<string> {
  const ids = new Set<string>();
  for (const child of document.feature?.children ?? []) {
    const backgrounds = child.background
      ? [child.background]
      : (child.rule?.children ?? [])
          .map((ruleChild) => ruleChild.background)
          .filter((bg) => bg !== undefined);
    for (const background of backgrounds) {
      for (const step of background.steps) {
        ids.add(step.id);
      }
    }
  }
  return ids;
}

function compileStep(
  step: PickleStep,
  opts: { isSoft: boolean; where: string },
): FlowIRStep {
  const text = step.text.trim();

  const remember = REMEMBER_STEP.exec(text);
  if (remember) {
    const [, description, varName] = remember;
    assertIdentifier(varName, opts.where);
    return { kind: 'capture', template: description.trim(), varName };
  }

  const call = CALL_FLOW_STEP.exec(text);
  if (call) {
    const [, flowName, argClause] = call;
    return {
      kind: 'callFlow',
      flowName,
      args: parseCallArgs(argClause, flowName, opts.where),
    };
  }

  return promptFromPickleType(step, text, opts);
}

function parseCallArgs(
  argClause: string | undefined,
  flowName: string,
  where: string,
): Record<string, string> {
  const args: Record<string, string> = {};
  if (argClause === undefined) return args;

  const matches = [...argClause.matchAll(CALL_FLOW_ARG)];
  if (matches.length === 0) {
    throw new Error(
      `[midscene] ${where}: could not parse arguments for flow "${flowName}" from "${argClause}". Expected: with name "value" and other "value".`,
    );
  }
  for (const [, name, value] of matches) {
    args[name] = value;
  }
  return args;
}

function promptFromPickleType(
  step: PickleStep,
  text: string,
  opts: { isSoft: boolean; where: string },
): PromptStepIR {
  // Pickle step types come from the Gherkin compiler, which already resolves
  // And/But (conjunctions) to the last primary keyword.
  switch (step.type) {
    case PickleStepType.CONTEXT:
      return { kind: 'prompt', node: 'ui', role: 'setup', template: text };
    case PickleStepType.OUTCOME:
      return {
        kind: 'prompt',
        node: opts.isSoft ? 'soft' : 'verify',
        role: 'assertion',
        template: text,
      };
    default:
      // ACTION and UNKNOWN (`*` bullets) both run as plain UI actions.
      return { kind: 'prompt', node: 'ui', role: 'action', template: text };
  }
}
