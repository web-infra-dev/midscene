/**
 * Static exploration model for the midscene-bdd dashboard.
 *
 * `buildExploreModel` is a pure function of the feature files on disk (plus
 * the skills directory): no test run, no model call, no browser. It reuses
 * the exact runtime primitives — scanAssets/parseFeature for parsing,
 * FlowRegistry.matchStep for flow-call detection, resolveStepAnnotations for
 * routing markers, collectAnnotationFootguns for annotation hygiene — so
 * what the dashboard shows is what the runner would do.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  GherkinDocument,
  Pickle,
  Scenario,
  Step,
} from '@cucumber/messages';
import {
  collectAnnotationFootguns,
  renderDataTable,
  resolveStepAnnotations,
  stepTypeOf,
} from '../annotations';
import { parseFeature, scanAssets } from '../assets';
import { discoverSkills } from '../skills';
import { ERROR_PREFIX, IDENT_RE_SOURCE, MAX_FLOW_DEPTH } from '../types';
import type {
  FlowRegistryLike,
  ResolvedBddConfig,
  StepAnnotations,
  StepType,
} from '../types';

// ———————————————————————————— public types ————————————————————————————

export type HealthKind =
  | 'unused-flow'
  | 'ambiguous-flow-match'
  | 'unknown-flow-sugar'
  | 'undeclared-param'
  | 'detached-annotation'
  | 'legacy-annotation'
  | 'tag-level-agent'
  | 'missing-skill'
  | 'flow-depth';

export interface HealthFinding {
  kind: HealthKind;
  message: string;
  /** Feature file path, relative to the config baseDir. */
  uri?: string;
  line?: number;
  /** The offending name (flow name, param, skill token, step text). */
  subject?: string;
}

/**
 * Where the runtime router sends a step. Mirrors the router precedence
 * exactly: `@no-ai` beats `@agent`/`$skill`, which beat the default
 * Midscene UI agent. Flow-call steps are routed AFTER annotations, so a
 * flow-call step keeps its annotation-derived route ('ui' when unannotated).
 */
export type StepRoute = 'ui' | 'agent' | 'no-ai';

export interface StepModel {
  /** Original keyword text from the AST, e.g. 'When ' (trailing space kept). */
  keyword: string;
  text: string;
  stepType: StepType;
  annotations: StepAnnotations;
  /** Which executor the runtime router would pick for this step. */
  route: StepRoute;
  /** Rendered `| cell | cell |` lines, when the step has a data table. */
  dataTable?: string;
  docString?: string;
  line: number;
  flowCall?: { flowId: string; args: Record<string, string> };
  /**
   * Flow-body steps only: `<name>` placeholders bound to a declared
   * `@param:` (substituted at call time), deduped in order of appearance.
   */
  paramUses?: string[];
  /**
   * Flow-body steps only: identifier-shaped `<name>` placeholders that name
   * no declared `@param:` (also in health — running the flow throws).
   */
  paramIssues?: string[];
}

export interface ScenarioModel {
  id: string;
  name: string;
  tags: string[];
  /** Feature file path, relative to the config baseDir. */
  uri: string;
  line: number;
  isOutline: boolean;
  exampleCount?: number;
  steps: StepModel[];
}

export interface FeatureModel {
  id: string;
  /** Absolute feature file path. */
  uri: string;
  /** Path relative to the config baseDir (used everywhere else). */
  relPath: string;
  name: string;
  description?: string;
  tags: string[];
  scenarios: ScenarioModel[];
}

export interface FlowModel {
  id: string;
  name: string;
  params: string[];
  uri: string;
  line: number;
  steps: StepModel[];
  /** Sorted unique caller ids (scenario:... and flow:...). */
  callers: string[];
}

export interface ExploreEdge {
  /** Caller id: `scenario:<relPath>#<line>` or `flow:<name>`. */
  from: string;
  /** Callee id: `flow:<name>`. */
  to: string;
  stepIndex: number;
  args: Record<string, string>;
}

export interface ExploreStats {
  features: number;
  scenarios: number;
  flows: number;
  steps: number;
  edges: number;
  /** Steps routed to the general coding agent (`# [agent]` / `$skill`). */
  agentSteps: number;
  /** Steps routed to a user-registered classic callback (`# [no-ai]`). */
  noAiSteps: number;
}

export interface ExploreModel {
  generatedAt: string;
  baseDir: string;
  features: FeatureModel[];
  flows: FlowModel[];
  edges: ExploreEdge[];
  health: HealthFinding[];
  stats: ExploreStats;
}

// ———————————————————————————— internals ————————————————————————————

// Same placeholder shape substituteParams (flows.ts) replaces at runtime.
const PLACEHOLDER_RE = new RegExp(`<(${IDENT_RE_SOURCE})>`, 'g');

/** Display order for health findings (errors first, hygiene last). */
const KIND_ORDER: HealthKind[] = [
  'ambiguous-flow-match',
  'unknown-flow-sugar',
  'flow-depth',
  'undeclared-param',
  'missing-skill',
  'detached-annotation',
  'legacy-annotation',
  'tag-level-agent',
  'unused-flow',
];

interface AstIndex {
  stepById: Map<string, Step>;
  scenarioById: Map<string, Scenario>;
}

/** Index AST steps and scenario nodes by id (covers Background and Rules). */
function indexAst(document: GherkinDocument): AstIndex {
  const stepById = new Map<string, Step>();
  const scenarioById = new Map<string, Scenario>();
  for (const child of document.feature?.children ?? []) {
    const scenarios = [child.scenario];
    const backgrounds = [child.background];
    for (const ruleChild of child.rule?.children ?? []) {
      scenarios.push(ruleChild.scenario);
      backgrounds.push(ruleChild.background);
    }
    for (const scenario of scenarios) {
      if (!scenario) continue;
      scenarioById.set(scenario.id, scenario);
      for (const step of scenario.steps) stepById.set(step.id, step);
    }
    for (const background of backgrounds) {
      for (const step of background?.steps ?? []) stepById.set(step.id, step);
    }
  }
  return { stepById, scenarioById };
}

function stripErrorPrefix(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith(ERROR_PREFIX)
    ? message.slice(ERROR_PREFIX.length).trim()
    : message;
}

/** Mutable collectors shared by every scenario/flow step walk. */
interface AnalyzeContext {
  registry: FlowRegistryLike;
  edges: ExploreEdge[];
  health: HealthFinding[];
  /** Skill token -> location of its first reference (for missing-skill). */
  skillFirstUse: Map<string, { uri: string; line: number }>;
}

/**
 * Walk one pickle's steps, building StepModels and feeding edges/health.
 * `flow` is set when the pickle is a flow body: its declared `@param:`
 * names give `<placeholder>` tokens meaning (substituted at call time);
 * an undeclared identifier-shaped placeholder throws at runtime, so it is
 * surfaced as an `undeclared-param` finding. Scenario steps have no
 * placeholder semantics at all (Scenario Outline `<x>` tokens are expanded
 * by gherkin before pickles exist).
 */
function analyzeSteps(
  ctx: AnalyzeContext,
  input: {
    ownerId: string;
    document: GherkinDocument;
    pickle: Pickle;
    stepById: Map<string, Step>;
    relUri: string;
    flow?: { name: string; params: string[] };
  },
): StepModel[] {
  const { ownerId, document, pickle, stepById, relUri, flow } = input;
  const steps: StepModel[] = [];

  pickle.steps.forEach((pickleStep, stepIndex) => {
    const astStep = stepById.get(pickleStep.astNodeIds[0]);
    if (!astStep) {
      throw new Error(
        `${ERROR_PREFIX} Could not locate the AST step for "${pickleStep.text}" in ${relUri}`,
      );
    }
    const line = astStep.location.line;

    const annotations = resolveStepAnnotations({
      document,
      pickle,
      pickleStep,
    });
    for (const skill of annotations.skills) {
      if (!ctx.skillFirstUse.has(skill)) {
        ctx.skillFirstUse.set(skill, { uri: relUri, line });
      }
    }

    // Flow-call detection mirrors the runtime router exactly: runStep only
    // consults the flow registry AFTER @no-ai and @agent/$skill are ruled
    // out, so annotated steps never produce flow calls, edges, or
    // flow-match findings. matchStep throws on ambiguity and on sugar
    // errors; classify by message shape (the registry raises plain Errors
    // with stable prefixes).
    let flowCall: StepModel['flowCall'];
    if (!annotations.noAi && !annotations.agent) {
      try {
        const match = ctx.registry.matchStep(pickleStep.text);
        if (match) {
          flowCall = { flowId: `flow:${match.flow.name}`, args: match.args };
          ctx.edges.push({
            from: ownerId,
            to: flowCall.flowId,
            stepIndex,
            args: match.args,
          });
        }
      } catch (error) {
        const message = stripErrorPrefix(error);
        ctx.health.push({
          kind: message.startsWith('Ambiguous flow call')
            ? 'ambiguous-flow-match'
            : 'unknown-flow-sugar',
          message,
          uri: relUri,
          line,
          subject: pickleStep.text,
        });
      }
    }

    // Placeholders only mean something inside a flow body, where they are
    // outline-style substitution slots for the declared @param: names.
    let paramUses: string[] | undefined;
    let paramIssues: string[] | undefined;
    if (flow) {
      const placeholders: string[] = [];
      for (const m of pickleStep.text.matchAll(PLACEHOLDER_RE)) {
        if (!placeholders.includes(m[1])) placeholders.push(m[1]);
      }
      const bound = placeholders.filter((name) => flow.params.includes(name));
      const issues = placeholders.filter((name) => !flow.params.includes(name));
      paramUses = bound.length > 0 ? bound : undefined;
      paramIssues = issues.length > 0 ? issues : undefined;
      for (const name of issues) {
        const params =
          flow.params.length > 0 ? flow.params.join(', ') : '(none)';
        ctx.health.push({
          kind: 'undeclared-param',
          message: `Flow "${flow.name}": step references <${name}>, which is not a declared @param: (params: ${params}) — calling this flow fails at runtime`,
          uri: relUri,
          line,
          subject: name,
        });
      }
    }

    steps.push({
      keyword: astStep.keyword,
      text: pickleStep.text,
      stepType: stepTypeOf(pickleStep),
      annotations,
      // resolveStepAnnotations already folds `$skill` tokens into `agent`,
      // so this ternary is the full router precedence (no-ai > agent > ui).
      route: annotations.noAi ? 'no-ai' : annotations.agent ? 'agent' : 'ui',
      dataTable: renderDataTable(pickleStep),
      docString: pickleStep.argument?.docString?.content,
      line,
      flowCall,
      paramUses,
      paramIssues,
    });
  });

  return steps;
}

/**
 * Nesting depth of a flow's call chain (a leaf flow is depth 1, matching the
 * runtime's flowDepth when a scenario calls it). Cycles count as Infinity.
 */
function flowCallDepth(
  flowId: string,
  calleesByFlow: Map<string, Set<string>>,
  stack: Set<string>,
): number {
  if (stack.has(flowId)) return Number.POSITIVE_INFINITY;
  stack.add(flowId);
  let deepest = 0;
  for (const callee of calleesByFlow.get(flowId) ?? []) {
    deepest = Math.max(deepest, flowCallDepth(callee, calleesByFlow, stack));
  }
  stack.delete(flowId);
  return 1 + deepest;
}

// ———————————————————————————— entry point ————————————————————————————

export async function buildExploreModel(
  config: ResolvedBddConfig,
): Promise<ExploreModel> {
  const { flows: registry, files } = await scanAssets(config);
  const skills = await discoverSkills(
    path.resolve(config.baseDir, config.paths.skills),
  );

  // scanAssets only returns the registry + file list, so re-parse each file
  // to keep document/pickle pairs per feature (assets.ts stays untouched).
  const parsed = await Promise.all(
    files.map(async (file) => {
      const { document, pickles } = parseFeature(
        await readFile(file, 'utf-8'),
        file,
      );
      return { document, pickles, uri: file };
    }),
  );

  const ctx: AnalyzeContext = {
    registry,
    edges: [],
    health: [],
    skillFirstUse: new Map(),
  };

  // Flows first (sorted by name) so edge generation order is deterministic.
  const flowDefs = [...registry.list()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const flows: FlowModel[] = flowDefs.map((def) => {
    const relPath = path.relative(config.baseDir, def.uri);
    const { stepById, scenarioById } = indexAst(def.document);
    const astScenario = scenarioById.get(def.pickle.astNodeIds[0]);
    if (!astScenario) {
      throw new Error(
        `${ERROR_PREFIX} Could not locate the AST scenario for flow "${def.name}" in ${relPath}`,
      );
    }
    const id = `flow:${def.name}`;
    return {
      id,
      name: def.name,
      params: def.params,
      uri: relPath,
      line: astScenario.location.line,
      steps: analyzeSteps(ctx, {
        ownerId: id,
        document: def.document,
        pickle: def.pickle,
        stepById,
        relUri: relPath,
        flow: { name: def.name, params: def.params },
      }),
      callers: [],
    };
  });

  // Features and scenarios, in (sorted) file order then document order.
  const features: FeatureModel[] = [];
  for (const { document, pickles, uri } of parsed) {
    if (!document.feature) continue; // empty/comment-only file
    const relPath = path.relative(config.baseDir, uri);
    const { stepById, scenarioById } = indexAst(document);

    // Group pickles by their scenario AST node: a Scenario Outline compiles
    // to one pickle per Examples row, all sharing astNodeIds[0].
    const pickleGroups = new Map<string, Pickle[]>();
    for (const pickle of pickles) {
      const scenarioId = pickle.astNodeIds[0];
      const group = pickleGroups.get(scenarioId);
      if (group) group.push(pickle);
      else pickleGroups.set(scenarioId, [pickle]);
    }

    const scenarios: ScenarioModel[] = [];
    for (const [scenarioAstId, group] of pickleGroups) {
      // Flow scenarios are modeled in the top-level flows array, not here.
      if (group[0].tags?.some((tag) => tag.name === '@flow')) continue;
      const astScenario = scenarioById.get(scenarioAstId);
      if (!astScenario) {
        throw new Error(
          `${ERROR_PREFIX} Could not locate the AST scenario for pickle "${group[0].name}" in ${relPath}`,
        );
      }
      // Scenario Outline: model ONE entry — name/keyword/line come from the
      // AST node, steps from the FIRST pickle expansion (Examples row 1).
      const isOutline = (astScenario.examples?.length ?? 0) > 0;
      const id = `scenario:${relPath}#${astScenario.location.line}`;
      scenarios.push({
        id,
        name: astScenario.name,
        tags: astScenario.tags.map((tag) => tag.name),
        uri: relPath,
        line: astScenario.location.line,
        isOutline,
        exampleCount: isOutline ? group.length : undefined,
        steps: analyzeSteps(ctx, {
          ownerId: id,
          document,
          pickle: group[0],
          stepById,
          relUri: relPath,
        }),
      });
    }

    const description = document.feature.description?.trim();
    features.push({
      id: `feature:${relPath}`,
      uri,
      relPath,
      name: document.feature.name,
      description: description || undefined,
      tags: document.feature.tags.map((tag) => tag.name),
      scenarios,
    });
  }

  // Annotation footguns (detached marker comments, legacy @-style markers,
  // tag-level @agent) are silent no-ops at runtime — exactly the hygiene the
  // Health panel exists for. Reuse the runtime collector and lift its
  // `uri:line` into fields.
  for (const { document, uri } of parsed) {
    const relPath = path.relative(config.baseDir, uri);
    for (const warning of collectAnnotationFootguns(document)) {
      const loc = new RegExp(
        ` at ${uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+) `,
      ).exec(warning);
      ctx.health.push({
        kind: warning.startsWith('tag "@agent"')
          ? 'tag-level-agent'
          : warning.includes('retired @-marker syntax')
            ? 'legacy-annotation'
            : 'detached-annotation',
        message: warning.split(`${uri}:`).join(`${relPath}:`),
        uri: relPath,
        line: loc ? Number(loc[1]) : undefined,
      });
    }
  }

  // Callers + unused flows from the collected edges.
  const callersByFlow = new Map<string, Set<string>>();
  const calleesByFlow = new Map<string, Set<string>>();
  for (const edge of ctx.edges) {
    let callers = callersByFlow.get(edge.to);
    if (!callers) {
      callers = new Set();
      callersByFlow.set(edge.to, callers);
    }
    callers.add(edge.from);
    if (edge.from.startsWith('flow:')) {
      let callees = calleesByFlow.get(edge.from);
      if (!callees) {
        callees = new Set();
        calleesByFlow.set(edge.from, callees);
      }
      callees.add(edge.to);
    }
  }
  for (const flow of flows) {
    flow.callers = [...(callersByFlow.get(flow.id) ?? [])].sort();
    if (flow.callers.length === 0) {
      ctx.health.push({
        kind: 'unused-flow',
        message: `Flow "${flow.name}" is never called by any scenario or flow`,
        uri: flow.uri,
        line: flow.line,
        subject: flow.name,
      });
    }
    const depth = flowCallDepth(flow.id, calleesByFlow, new Set());
    if (depth > MAX_FLOW_DEPTH) {
      ctx.health.push({
        kind: 'flow-depth',
        message: Number.isFinite(depth)
          ? `Flow "${flow.name}" nests flow calls ${depth} deep, exceeding MAX_FLOW_DEPTH (${MAX_FLOW_DEPTH}) — calling it will fail at runtime`
          : `Flow "${flow.name}" participates in a flow-call cycle — calling it will fail at runtime`,
        uri: flow.uri,
        line: flow.line,
        subject: flow.name,
      });
    }
  }

  // Missing skills: union of $tokens across all analyzed steps.
  for (const name of [...ctx.skillFirstUse.keys()].sort()) {
    if (skills.has(name)) continue;
    const firstUse = ctx.skillFirstUse.get(name) as {
      uri: string;
      line: number;
    };
    ctx.health.push({
      kind: 'missing-skill',
      message: `$${name} does not resolve to a skill under ${config.paths.skills}`,
      uri: firstUse.uri,
      line: firstUse.line,
      subject: name,
    });
  }

  const edges = [...ctx.edges].sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.stepIndex - b.stepIndex ||
      a.to.localeCompare(b.to),
  );
  const health = [...ctx.health].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.uri ?? '').localeCompare(b.uri ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.message.localeCompare(b.message),
  );

  const scenarioCount = features.reduce(
    (sum, feature) => sum + feature.scenarios.length,
    0,
  );
  const allSteps: StepModel[] = [];
  for (const feature of features) {
    for (const scenario of feature.scenarios) allSteps.push(...scenario.steps);
  }
  for (const flow of flows) allSteps.push(...flow.steps);
  const stepCount = allSteps.length;
  const agentSteps = allSteps.filter((step) => step.route === 'agent').length;
  const noAiSteps = allSteps.filter((step) => step.route === 'no-ai').length;

  return {
    generatedAt: new Date().toISOString(),
    baseDir: config.baseDir,
    features,
    flows,
    edges,
    health,
    stats: {
      features: features.length,
      scenarios: scenarioCount,
      flows: flows.length,
      steps: stepCount,
      edges: edges.length,
      agentSteps,
      noAiSteps,
    },
  };
}
