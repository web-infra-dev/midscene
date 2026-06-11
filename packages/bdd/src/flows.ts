/**
 * Flow registry and executor for @midscene/bdd.
 *
 * A flow is a `@flow`-tagged scenario whose NAME is a cucumber expression.
 * Other scenarios invoke it either by writing text that matches the
 * expression, or via the literal sugar `I run the "<name>" flow with x "v"`.
 */
import { buildStepContext } from './annotations';
import { type TextMatcher, compileTextMatcher } from './text-match';
import {
  ERROR_PREFIX,
  type FlowDef,
  type FlowMatch,
  type FlowRegistryLike,
  IDENT_RE_SOURCE,
  MAX_FLOW_DEPTH,
  type RouterContext,
  type RunStepFn,
} from './types';

const RUN_FLOW_SUGAR_RE = /^I run the "([^"]+)" flow( with (.+))?$/i;
const SUGAR_ARG_RE = new RegExp(`(${IDENT_RE_SOURCE})\\s+"([^"]*)"`, 'g');
const PARAM_PLACEHOLDER_RE = new RegExp(`<(${IDENT_RE_SOURCE})>`, 'g');

/**
 * Replace `<param>` placeholders in a flow-body step with the call's
 * arguments — the same `<x>` visual (and the same substitute-then-run
 * semantics) as a Scenario Outline, scoped to the flow body. An
 * identifier-shaped placeholder that is not a declared `@param:` is an
 * authoring error; non-identifier `<...>` content is left untouched.
 */
export function substituteParams(
  text: string,
  flow: FlowDef,
  args: Record<string, string>,
): string {
  return text.replace(PARAM_PLACEHOLDER_RE, (full, name: string) => {
    const value = args[name];
    if (value === undefined) {
      const params = flow.params.length > 0 ? flow.params.join(', ') : '(none)';
      throw new Error(
        `${ERROR_PREFIX} Flow "${flow.name}" (${flow.uri}): step "${text}" references <${name}>, which is not a declared @param: (params: ${params})`,
      );
    }
    return value;
  });
}

interface RegisteredFlow {
  def: FlowDef;
  /** Compiled once at registration (expression or literal fallback). */
  match: TextMatcher;
}

export class FlowRegistry implements FlowRegistryLike {
  private readonly entries: RegisteredFlow[] = [];

  constructor(defs: FlowDef[] = []) {
    for (const def of defs) this.add(def);
  }

  add(def: FlowDef): void {
    this.entries.push({ def, match: compileTextMatcher(def.name) });
  }

  list(): FlowDef[] {
    return this.entries.map((entry) => entry.def);
  }

  getByName(name: string): FlowDef | undefined {
    return this.entries.find((entry) => entry.def.name === name)?.def;
  }

  matchStep(text: string): FlowMatch | undefined {
    const sugar = RUN_FLOW_SUGAR_RE.exec(text);
    if (sugar) return this.matchSugar(sugar[1], sugar[3]);

    const matches: FlowMatch[] = [];
    for (const entry of this.entries) {
      const match = this.matchExpression(entry, text);
      if (match) matches.push(match);
    }
    if (matches.length > 1) {
      const listing = matches
        .map((m) => `  - "${m.flow.name}" (${m.flow.uri})`)
        .join('\n');
      throw new Error(
        `${ERROR_PREFIX} Ambiguous flow call: "${text}" matches ${matches.length} flows:\n${listing}`,
      );
    }
    return matches[0];
  }

  private matchExpression(
    entry: RegisteredFlow,
    text: string,
  ): FlowMatch | undefined {
    const { def } = entry;
    const captured = entry.match(text);
    if (!captured) return undefined;
    if (captured.length !== def.params.length) {
      const params = def.params.length > 0 ? def.params.join(', ') : '(none)';
      throw new Error(
        `${ERROR_PREFIX} Flow "${def.name}" (${def.uri}): expression captures ${captured.length} values but @param: declares ${def.params.length} (params: ${params})`,
      );
    }
    const args: Record<string, string> = {};
    def.params.forEach((param, i) => {
      args[param] = captured[i];
    });
    return { flow: def, args };
  }

  private matchSugar(name: string, withClause: string | undefined): FlowMatch {
    const def = this.getByName(name);
    if (!def) {
      const registered =
        this.entries.length > 0
          ? this.entries.map((entry) => `"${entry.def.name}"`).join(', ')
          : '(none)';
      throw new Error(
        `${ERROR_PREFIX} Unknown flow "${name}". Registered flows: ${registered}`,
      );
    }
    const args: Record<string, string> = {};
    if (withClause) {
      for (const m of withClause.matchAll(SUGAR_ARG_RE)) {
        const [, argName, value] = m;
        if (!def.params.includes(argName)) {
          const params =
            def.params.length > 0 ? def.params.join(', ') : '(none)';
          throw new Error(
            `${ERROR_PREFIX} Flow "${def.name}" (${def.uri}): unknown argument "${argName}" (params: ${params})`,
          );
        }
        args[argName] = value;
      }
    }
    const missing = def.params.filter((param) => !(param in args));
    if (missing.length > 0) {
      throw new Error(
        `${ERROR_PREFIX} Flow "${def.name}" (${def.uri}): missing argument(s): ${missing.join(', ')}`,
      );
    }
    return { flow: def, args };
  }
}

export async function executeFlow(
  match: FlowMatch,
  parentCtx: RouterContext,
  runStep: RunStepFn,
): Promise<void> {
  const { flow, args } = match;
  const depth = parentCtx.flowDepth + 1;
  if (depth > MAX_FLOW_DEPTH) {
    throw new Error(
      `${ERROR_PREFIX} Flow "${flow.name}": call depth exceeds ${MAX_FLOW_DEPTH}; flatten the composition.`,
    );
  }

  for (const step of flow.pickle.steps) {
    const childCtx = buildStepContext({
      document: flow.document,
      pickle: flow.pickle,
      pickleStep: step,
      flowDepth: depth,
      runtime: parentCtx,
      agents: parentCtx,
      attach: parentCtx.attach,
      log: parentCtx.log,
    });
    // Substitute AFTER context building: annotations/$skills are resolved
    // from the authored text, so an argument value can never inject routing.
    await runStep({
      ...childCtx,
      stepText: substituteParams(childCtx.stepText, flow, args),
    });
  }
}
