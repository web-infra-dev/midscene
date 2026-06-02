import { basename, extname } from 'node:path';
import type { MidsceneYamlFlowItem } from '@midscene/core';
import yaml from 'js-yaml';
import { BUILTIN_YAML_STEP_NAMES } from '../builtin-steps';
import type {
  CustomYamlStepHandler,
  FrameworkAgent,
  NormalizedYamlCase,
} from '../types';

const caseNameFromPath = (filePath: string): string =>
  basename(filePath, extname(filePath)) || 'case';

/**
 * Convert a framework YAML case (top-level `flow`) into a normalized shape. The
 * first version intentionally requires the documented top-level `flow` form and
 * rejects full `tasks` documents.
 */
export function normalizeYamlCase(
  content: string,
  filePath: string,
): NormalizedYamlCase {
  const parsed = yaml.load(content) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} must be a YAML object`);
  }

  if (Array.isArray(parsed.flow)) {
    const { flow, ...rest } = parsed;
    return {
      name: caseNameFromPath(filePath),
      flow: flow as MidsceneYamlFlowItem[],
      raw: rest,
    };
  }

  if (Array.isArray((parsed as { tasks?: unknown }).tasks)) {
    throw new Error(
      `${filePath} uses a full "tasks" document; framework cases must use a top-level "flow"`,
    );
  }

  throw new Error(`${filePath} must include a top-level "flow" array`);
}

const dumpSingleStepTask = (caseName: string, step: unknown): string =>
  yaml.dump(
    {
      tasks: [
        {
          name: caseName,
          flow: [step],
        },
      ],
    },
    { lineWidth: -1, noRefs: true },
  );

const resolveStepName = (
  step: Record<string, unknown>,
  yamlSteps: Record<string, CustomYamlStepHandler> | undefined,
): { stepName: string; kind: 'custom' | 'builtin' | 'unknown' } => {
  const keys = Object.keys(step);

  // A custom step is identified by the registered key; built-in steps may carry
  // extra sibling keys (e.g. `aiInput` + `value`), so we look the action key up
  // instead of requiring exactly one key.
  const customKey = keys.find((key) => yamlSteps?.[key]);
  if (customKey) {
    return { stepName: customKey, kind: 'custom' };
  }

  const builtinKey = keys.find((key) => BUILTIN_YAML_STEP_NAMES.has(key));
  if (builtinKey) {
    return { stepName: builtinKey, kind: 'builtin' };
  }

  return { stepName: keys[0] ?? '', kind: 'unknown' };
};

/**
 * Run a flow step by step so built-in steps and custom `yamlSteps` interleave in
 * the authored order. Built-in steps are forwarded to `agent.runYaml`; custom
 * steps invoke their handler with the YAML value and the current context.
 */
export async function runYamlFlowWithCustomSteps(options: {
  agent: FrameworkAgent;
  filePath: string;
  caseName: string;
  flow: MidsceneYamlFlowItem[];
  yamlSteps?: Record<string, CustomYamlStepHandler>;
  state: Record<string, unknown>;
}): Promise<void> {
  for (const [stepIndex, step] of options.flow.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(
        `${options.filePath} step ${stepIndex + 1} must be an object`,
      );
    }

    const stepRecord = step as Record<string, unknown>;
    const { stepName, kind } = resolveStepName(stepRecord, options.yamlSteps);

    if (kind === 'custom') {
      const handler = options.yamlSteps![stepName];
      await handler(stepRecord[stepName], {
        agent: options.agent,
        state: options.state,
        filePath: options.filePath,
        stepIndex,
        stepName,
      });
      continue;
    }

    if (kind === 'builtin') {
      await options.agent.runYaml(
        dumpSingleStepTask(`${options.caseName}:${stepName}`, step),
      );
      continue;
    }

    throw new Error(
      `${options.filePath} step ${stepIndex + 1} uses unknown step "${stepName}"`,
    );
  }
}

/**
 * Run a whole built-in case in a single `agent.runYaml` invocation. Used when no
 * custom `yamlSteps` are registered, so the existing YAML runner handles the
 * complete flow at once.
 */
export async function runBuiltinYamlCase(options: {
  agent: FrameworkAgent;
  normalizedCase: NormalizedYamlCase;
}): Promise<void> {
  await options.agent.runYaml(
    yaml.dump(
      {
        ...options.normalizedCase.raw,
        tasks: [
          {
            name: options.normalizedCase.name,
            flow: options.normalizedCase.flow,
          },
        ],
      },
      { lineWidth: -1, noRefs: true },
    ),
  );
}
