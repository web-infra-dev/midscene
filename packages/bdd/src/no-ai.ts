/**
 * Classic-BDD escape hatch for `# @no-ai` steps.
 *
 * Users register plain cucumber-style callbacks via `Given` / `When` / `Then`
 * / `defineStep`. Per cucumber convention the keyword is documentation only:
 * all four aliases land in a single keyword-agnostic registry and matching
 * ignores the keyword entirely.
 *
 * String patterns are matched as cucumber expressions (falling back to a
 * literal exact-match when the string does not compile as an expression);
 * RegExp patterns are matched via `.exec` with a fresh `lastIndex`.
 */
import {
  type TextMatcher,
  compileTextMatcher,
  toArgString,
} from './text-match';
import type { UserStepDef, UserStepFn, UserStepMatch } from './types';
import { ERROR_PREFIX } from './types';

interface RegisteredStep {
  def: UserStepDef;
  match: TextMatcher;
}

/**
 * The package ships dual-format (dist/lib CJS + dist/es ESM), and one process
 * routinely loads BOTH copies: cucumber imports the register entry as CJS
 * while an ESM user project imports `@midscene/bdd` as ESM. Module-level
 * state would give each copy its own registry and `# @no-ai` lookups would
 * never see the user's callbacks — so the registry is a process-wide
 * singleton stored on `globalThis`.
 */
const REGISTRY_KEY = Symbol.for('@midscene/bdd:no-ai-registry');

function registry(): RegisteredStep[] {
  const store = globalThis as { [REGISTRY_KEY]?: RegisteredStep[] };
  if (!store[REGISTRY_KEY]) {
    store[REGISTRY_KEY] = [];
  }
  return store[REGISTRY_KEY];
}

function patternKey(pattern: string | RegExp): string {
  return pattern instanceof RegExp
    ? `regexp:${pattern.source}`
    : `string:${pattern}`;
}

function patternLabel(pattern: string | RegExp): string {
  return pattern instanceof RegExp ? String(pattern) : pattern;
}

function buildMatcher(pattern: string | RegExp): TextMatcher {
  if (pattern instanceof RegExp) {
    // Clone so a global/sticky user regex never carries lastIndex state
    // between matches.
    const regexp = new RegExp(pattern.source, pattern.flags);
    return (text) => {
      regexp.lastIndex = 0;
      const result = regexp.exec(text);
      if (!result) return undefined;
      return result.slice(1).map(toArgString);
    };
  }
  return compileTextMatcher(pattern);
}

function registerStep(pattern: string | RegExp, fn: UserStepFn): void {
  const key = patternKey(pattern);
  const steps = registry();
  if (steps.some((entry) => patternKey(entry.def.pattern) === key)) {
    throw new Error(
      `${ERROR_PREFIX} Step definition already registered for pattern: ${patternLabel(pattern)}`,
    );
  }
  steps.push({ def: { pattern, fn }, match: buildMatcher(pattern) });
}

export function Given(pattern: string | RegExp, fn: UserStepFn): void {
  registerStep(pattern, fn);
}

export function When(pattern: string | RegExp, fn: UserStepFn): void {
  registerStep(pattern, fn);
}

export function Then(pattern: string | RegExp, fn: UserStepFn): void {
  registerStep(pattern, fn);
}

export function defineStep(pattern: string | RegExp, fn: UserStepFn): void {
  registerStep(pattern, fn);
}

export function matchUserStep(text: string): UserStepMatch | undefined {
  const matches: UserStepMatch[] = [];
  for (const entry of registry()) {
    const args = entry.match(text);
    if (args) {
      matches.push({ def: entry.def, args });
    }
  }
  if (matches.length > 1) {
    const patterns = matches
      .map((match) => patternLabel(match.def.pattern))
      .join(', ');
    throw new Error(
      `${ERROR_PREFIX} Multiple step definitions match "${text}": ${patterns}`,
    );
  }
  return matches[0];
}

export function noAiSnippet(stepText: string): string {
  let argCount = 0;
  // Suggest a cucumber expression: each double-quoted value becomes {string}.
  const expression = stepText.replace(/"[^"]*"/g, () => {
    argCount += 1;
    return '{string}';
  });
  const escaped = expression.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const argNames = Array.from(
    { length: argCount },
    (_, i) => `arg${i + 1}`,
  ).join(', ');
  return [
    `defineStep('${escaped}', async function (${argNames}) {`,
    '  // `this` is the step context (getUiAgent, attach, log);',
    '  // throw to fail the step',
    '});',
  ].join('\n');
}

export function noAiUnmatchedError(stepText: string): Error {
  return new Error(
    `${ERROR_PREFIX} Step is marked @no-ai but no step definition matched:\n  ${stepText}\nImplement it:\n\n${noAiSnippet(stepText)}`,
  );
}

export function clearUserSteps(): void {
  registry().length = 0;
}

export function listUserSteps(): UserStepDef[] {
  return registry().map((entry) => entry.def);
}
