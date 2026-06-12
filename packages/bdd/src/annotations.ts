/**
 * Step-level annotation resolution for @midscene/bdd.
 *
 * Gherkin has no step-level tags, so per-step routing markers live in `#`
 * comment lines directly above the step (`[agent]`, `[no-ai]`, `[soft]`, and
 * `$skill` tokens). The bracket form is deliberate: `@`-prefixed markers
 * would look like cucumber's native tag syntax (`@flow`, scenario-level
 * `@no-ai`), which lives on header lines, not comments. Scenario/feature
 * level `@no-ai` / `@soft` tags are inherited via the pickle's tags; agent
 * routing is intentionally per-line only.
 */
import type {
  GherkinDocument,
  Pickle,
  PickleStep,
  Step,
  Tag,
} from '@cucumber/messages';
import { PickleStepType } from '@cucumber/messages';
import { ERROR_PREFIX } from './types';
import type { RouterContext, StepAnnotations, StepType } from './types';

// Skill tokens must start with a letter: a leading digit would make money
// amounts in step text ("the total is $42.50") hijack routing to the agent.
const SKILL_TOKEN_RE = /\$([A-Za-z][A-Za-z0-9_-]*)/g;
/**
 * An annotation comment line must consist ONLY of markers/tokens after `#`
 * (e.g. `# [agent] $check-logs`). Prose comments that merely mention a marker
 * ("# TODO: make this [no-ai] later") must not flip routing.
 */
const ANNOTATION_LINE_RE =
  /^(?:\[(?:agent|no-ai|soft)\]|\$[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?:\[(?:agent|no-ai|soft)\]|\$[A-Za-z][A-Za-z0-9_-]*))*$/;
const AGENT_MARKER_RE = /\[agent\]/;
const NO_AI_MARKER_RE = /\[no-ai\]/;
const SOFT_MARKER_RE = /\[soft\]/;
/**
 * A comment body that STARTS with a routing marker but is not marker-only
 * (`# [agent] check the logs`) was likely intended to route — it is silently
 * inert, so the footgun audit flags it. Prose that merely mentions a marker
 * mid-line ("# TODO: make this [no-ai] later") stays un-flagged.
 */
const MARKER_AT_START_RE =
  /^(?:\[(?:agent|no-ai|soft)\]|\$[A-Za-z][A-Za-z0-9_-]*)(?:\s|$)/;
/**
 * The pre-release `@`-prefixed marker syntax (`# @agent`, `# @no-ai`,
 * `# @soft`, optionally mixed with `$skill` tokens). It no longer routes —
 * it was replaced with brackets so comment markers cannot be confused with
 * cucumber's native tag syntax — but the footgun audit still recognizes the
 * shape and tells authors to migrate. Requires at least one `@` marker:
 * `$skill`-only lines are valid CURRENT syntax and never legacy.
 */
const LEGACY_MARKER_LINE_RE =
  /^(?:@(?:agent|no-ai|soft)|\$[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?:@(?:agent|no-ai|soft)|\$[A-Za-z][A-Za-z0-9_-]*))*$/;
const LEGACY_MARKER_RE = /@(agent|no-ai|soft)\b/;

/**
 * The single definition of "this comment line is a routing marker": strip
 * the `#`, and require a marker-only body. Returns the body for marker
 * lines, undefined for prose. Both the resolver and the footgun audit go
 * through here so the two can never disagree on what routes.
 */
function markerBody(rawText: string): string | undefined {
  const text = rawText.trim().replace(/^#/, '').trim();
  return ANNOTATION_LINE_RE.test(text) ? text : undefined;
}

/**
 * Extract `$skill-name` tokens from text, deduped, in order of first
 * appearance.
 */
export function parseSkillTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(SKILL_TOKEN_RE)) {
    const token = match[1];
    if (!tokens.includes(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** Map the gherkin-computed pickle step type to our StepType. */
export function stepTypeOf(pickleStep: PickleStep): StepType {
  switch (pickleStep.type) {
    case PickleStepType.CONTEXT:
      return 'context';
    case PickleStepType.ACTION:
      return 'action';
    case PickleStepType.OUTCOME:
      return 'outcome';
    case PickleStepType.UNKNOWN:
    case undefined:
      return 'unknown';
    default: {
      const _exhaustive: never = pickleStep.type;
      return 'unknown';
    }
  }
}

interface DocumentIndex {
  stepById: Map<string, Step>;
  commentTextByLine: Map<number, string>;
}

// Gherkin documents are immutable after parse and reused across a feature's
// scenarios (and across flow calls), so index each document once.
const documentIndexes = new WeakMap<GherkinDocument, DocumentIndex>();

function indexDocument(document: GherkinDocument): DocumentIndex {
  let index = documentIndexes.get(document);
  if (index) return index;

  const stepById = new Map<string, Step>();
  // Covers feature-level Background and Scenario steps plus Rule children;
  // Scenario Outline pickle steps point at the outline step node, so the
  // same walk covers them.
  for (const child of document.feature?.children ?? []) {
    const scopes = [child.background, child.scenario];
    for (const ruleChild of child.rule?.children ?? []) {
      scopes.push(ruleChild.background, ruleChild.scenario);
    }
    for (const scope of scopes) {
      for (const step of scope?.steps ?? []) {
        stepById.set(step.id, step);
      }
    }
  }

  const commentTextByLine = new Map<number, string>();
  for (const comment of document.comments ?? []) {
    commentTextByLine.set(comment.location.line, comment.text);
  }

  index = { stepById, commentTextByLine };
  documentIndexes.set(document, index);
  return index;
}

function addUnique(target: string[], tokens: string[]): void {
  for (const token of tokens) {
    if (!target.includes(token)) {
      target.push(token);
    }
  }
}

/**
 * Resolve routing annotations for one pickle step from (a) the contiguous
 * `#` comment block ending directly above the step's AST line, (b) inherited
 * pickle tags (`@no-ai` / `@soft` only), and (c) inline `$skill` tokens.
 */
export function resolveStepAnnotations(input: {
  document: GherkinDocument;
  pickle: Pickle;
  pickleStep: PickleStep;
}): StepAnnotations {
  const { document, pickle, pickleStep } = input;

  const { stepById, commentTextByLine } = indexDocument(document);
  const astNodeId = pickleStep.astNodeIds[0];
  const step = astNodeId ? stepById.get(astNodeId) : undefined;
  if (!step) {
    throw new Error(
      `${ERROR_PREFIX} Could not locate the AST step for pickle step "${pickleStep.text}"`,
    );
  }

  // Contiguous run of comment lines ending exactly at stepLine - 1. The run
  // stops at the previous step / scenario header line, so comments above a
  // `Scenario:` header never leak into the scenario's first step.
  const blockTexts: string[] = [];
  for (let line = step.location.line - 1; commentTextByLine.has(line); line--) {
    blockTexts.unshift(commentTextByLine.get(line) as string);
  }

  let agent = false;
  let noAi = false;
  let soft = false;
  const skills: string[] = [];

  for (const rawText of blockTexts) {
    // Only marker-shaped lines route; prose comments are inert.
    const text = markerBody(rawText);
    if (text === undefined) {
      continue;
    }
    if (AGENT_MARKER_RE.test(text)) {
      agent = true;
    }
    if (NO_AI_MARKER_RE.test(text)) {
      noAi = true;
    }
    if (SOFT_MARKER_RE.test(text)) {
      soft = true;
    }
    addUnique(skills, parseSkillTokens(text));
  }

  // Pickle tags already include inherited feature/rule tags per Gherkin
  // semantics. `@agent` is deliberately not honored here (per-line bailout
  // by design) and `@flow` is handled by the assets scanner.
  for (const tag of pickle.tags ?? []) {
    if (tag.name === '@no-ai') {
      noAi = true;
    }
    if (tag.name === '@soft') {
      soft = true;
    }
  }

  // Inline $tokens come from the AUTHORED step text (the AST node), not the
  // pickle text: a Scenario Outline pickle is post-substitution, so an
  // Examples cell value like `$sneaky` must never inject routing — the same
  // invariant flows.ts protects for flow arguments. (Flow-body steps already
  // resolve from authored text: their pickle is never pre-substituted.)
  addUnique(skills, parseSkillTokens(step.text));

  if (skills.length > 0) {
    agent = true;
  }

  return { agent, noAi, soft, skills };
}

/**
 * Audit a parsed document for the silent annotation footguns and return
 * one human-readable warning per occurrence (callers decide how to emit):
 *
 * 1. A marker-only comment block (`# [agent]`, `# [no-ai]`, `# [soft]`,
 *    `# $skill`) that is NOT directly above a step — e.g. separated by a
 *    blank line — never attaches to anything and silently does not route.
 * 2. An `@agent` Gherkin tag at feature/rule/scenario/examples level —
 *    `@no-ai` and `@soft` are inherited via pickle tags, but agent routing
 *    is deliberately per-line only, so the tag is silently ignored.
 * 3. A comment line that STARTS with a routing marker but mixes in prose
 *    (`# [agent] check the logs`) — only marker-only lines route, so the
 *    line is silently inert despite almost certainly being intended.
 * 4. A marker-only comment in the retired `@`-prefixed syntax (`# @agent`,
 *    `# @no-ai`, `# @soft`) — it never routes anymore; authors must switch
 *    to the bracket form.
 */
export function collectAnnotationFootguns(document: GherkinDocument): string[] {
  const warnings: string[] = [];
  const uri = document.uri ?? '(unknown feature)';

  const { stepById, commentTextByLine } = indexDocument(document);
  const stepLines = new Set<number>();
  for (const step of stepById.values()) {
    stepLines.add(step.location.line);
  }

  for (const [line, rawText] of commentTextByLine) {
    if (markerBody(rawText) === undefined) {
      const body = rawText.trim().replace(/^#/, '').trim();
      // The retired `@`-marker syntax: marker-only shape, but with the old
      // `@` prefix. Checked before the prose rule — a legacy line also
      // "starts with" nothing the new grammar knows, and the migration hint
      // is the actionable message.
      if (LEGACY_MARKER_LINE_RE.test(body) && LEGACY_MARKER_RE.test(body)) {
        warnings.push(
          `annotation comment "${rawText.trim()}" at ${uri}:${line} uses the retired @-marker syntax and is ignored — write square-bracket markers instead (\`# @agent\` → \`# [agent]\`, \`# @no-ai\` → \`# [no-ai]\`, \`# @soft\` → \`# [soft]\`); brackets keep comment markers visually distinct from cucumber tags`,
        );
        continue;
      }
      // Marker-at-start prose ("# [agent] check the logs") is inert despite
      // almost certainly being intended to route.
      if (MARKER_AT_START_RE.test(body)) {
        warnings.push(
          `annotation comment "${rawText.trim()}" at ${uri}:${line} starts with a routing marker but mixes in prose, so the whole line is ignored — keep marker lines marker-only (e.g. "# [agent]") and put prose in a separate comment`,
        );
      }
      continue;
    }
    // Attached means the contiguous comment run containing this line ends
    // directly above a step line — the exact rule resolveStepAnnotations uses.
    let runEnd = line;
    while (commentTextByLine.has(runEnd + 1)) {
      runEnd++;
    }
    if (stepLines.has(runEnd + 1)) {
      continue;
    }
    warnings.push(
      `annotation comment "${rawText.trim()}" at ${uri}:${line} is not directly above a step (blank line or non-step content in between), so it will not affect routing — move it to the line right above its step`,
    );
  }

  // Same explicit feature/rule/scenario walk as indexDocument, plus the
  // Examples tags scenarios carry.
  const checkTags = (tags: readonly Tag[]) => {
    for (const tag of tags) {
      if (tag.name === '@agent') {
        warnings.push(
          `tag "@agent" at ${uri}:${tag.location.line} is ignored: agent routing is per-step only — put a "# [agent]" comment directly above the step (feature/scenario tags support @no-ai, @soft, @flow, @param:*)`,
        );
      }
    }
  };
  const feature = document.feature;
  if (feature) {
    checkTags(feature.tags);
    for (const child of feature.children) {
      if (child.rule) checkTags(child.rule.tags);
      const scenarios = child.rule
        ? child.rule.children.map((ruleChild) => ruleChild.scenario)
        : [child.scenario];
      for (const scenario of scenarios) {
        if (!scenario) continue;
        checkTags(scenario.tags);
        for (const examples of scenario.examples) {
          checkTags(examples.tags);
        }
      }
    }
  }

  return warnings;
}

/** Render a pickle data table as `| cell | cell |` lines for prompts. */
export function renderDataTable(step: PickleStep): string | undefined {
  const table = step.argument?.dataTable;
  if (!table) return undefined;
  return table.rows
    .map((row) => `| ${row.cells.map((cell) => cell.value).join(' | ')} |`)
    .join('\n');
}

export interface StepContextInput {
  document: GherkinDocument;
  pickle: Pickle;
  pickleStep: PickleStep;
  flowDepth: number;
  runtime: Pick<RouterContext, 'flows' | 'skills'>;
  agents: Pick<RouterContext, 'getUiAgent' | 'getGeneralAgent' | 'peekUiAgent'>;
  attach?: RouterContext['attach'];
  log?: RouterContext['log'];
}

/**
 * The single way a (document, pickle, pickleStep) triple becomes a
 * RouterContext — used by the catch-all step (register.ts), the flow
 * executor (flows.ts), and the integration harness, so prompts and routing
 * can never drift between top-level and flow steps.
 */
export function buildStepContext(input: StepContextInput): RouterContext {
  const { pickleStep } = input;
  return {
    stepText: pickleStep.text,
    stepType: stepTypeOf(pickleStep),
    annotations: resolveStepAnnotations({
      document: input.document,
      pickle: input.pickle,
      pickleStep,
    }),
    dataTable: renderDataTable(pickleStep),
    docString: pickleStep.argument?.docString?.content,
    flowDepth: input.flowDepth,
    flows: input.runtime.flows,
    skills: input.runtime.skills,
    getUiAgent: input.agents.getUiAgent,
    getGeneralAgent: input.agents.getGeneralAgent,
    peekUiAgent: input.agents.peekUiAgent,
    attach: input.attach,
    log: input.log,
  };
}
