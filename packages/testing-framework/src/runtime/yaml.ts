import { basename, extname } from 'node:path';
import type { MidsceneYamlFlowItem } from '@midscene/core';
import yaml from 'js-yaml';
import type {
  CustomYamlStepHandler,
  FrameworkAgent,
  MidsceneFrameworkConfig,
  NormalizedYamlCase,
} from '../types';

const builtinStepNames = new Set([
  'ai',
  'aiAct',
  'aiAction',
  'aiAssert',
  'aiQuery',
  'aiInput',
  'aiTap',
  'aiHover',
  'aiScroll',
  'aiKeyboardPress',
  'aiWaitFor',
  'sleep',
  'javascript',
  'recordToReport',
  'logScreenshot',
  'launch',
  'terminate',
  'runAdbShell',
  'RunAdbShell',
  'runWdaRequest',
  'RunWdaRequest',
]);

const readSingleStep = (
  step: unknown,
  filePath: string,
  stepIndex: number,
): { stepName: string; value: unknown } => {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`${filePath} step ${stepIndex + 1} must be an object`);
  }

  const entries = Object.entries(step as Record<string, unknown>);
  if (entries.length !== 1) {
    throw new Error(
      `${filePath} step ${stepIndex + 1} must contain exactly one key`,
    );
  }

  const [stepName, value] = entries[0];
  return { stepName, value };
};

const caseNameFromPath = (filePath: string): string =>
  basename(filePath, extname(filePath)) || 'case';

export function normalizeYamlCase(
  content: string,
  filePath: string,
): NormalizedYamlCase {
  const parsed = yaml.load(content) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${filePath} must be a YAML object`);
  }

  if (Array.isArray(parsed.tasks)) {
    return {
      tasks: parsed.tasks as NormalizedYamlCase['tasks'],
      raw: parsed,
    };
  }

  if (Array.isArray(parsed.flow)) {
    const { flow, ...rest } = parsed;
    return {
      tasks: [
        {
          name: caseNameFromPath(filePath),
          flow: flow as MidsceneYamlFlowItem[],
        },
      ],
      raw: rest,
    };
  }

  throw new Error(`${filePath} must include either tasks or flow`);
}

const dumpSingleBuiltinStep = (caseName: string, step: unknown): string =>
  yaml.dump(
    {
      tasks: [
        {
          name: caseName,
          flow: [step],
        },
      ],
    },
    {
      lineWidth: -1,
      noRefs: true,
    },
  );

export async function runYamlFlowWithCustomSteps(options: {
  agent: FrameworkAgent;
  filePath: string;
  caseName: string;
  flow: MidsceneYamlFlowItem[];
  yamlSteps?: Record<string, CustomYamlStepHandler>;
  state: Record<string, unknown>;
}): Promise<void> {
  for (const [stepIndex, step] of options.flow.entries()) {
    const { stepName, value } = readSingleStep(
      step,
      options.filePath,
      stepIndex,
    );

    if (builtinStepNames.has(stepName)) {
      await options.agent.runYaml(
        dumpSingleBuiltinStep(`${options.caseName}:${stepName}`, step),
      );
      continue;
    }

    const customStep = options.yamlSteps?.[stepName];
    if (!customStep) {
      throw new Error(
        `${options.filePath} step ${stepIndex + 1} uses unknown step "${stepName}"`,
      );
    }

    await customStep(value, {
      agent: options.agent,
      state: options.state,
      filePath: options.filePath,
      stepIndex,
      stepName,
    });
  }
}

const mergeYamlCaseWithConfig = (
  normalizedCase: NormalizedYamlCase,
  config: MidsceneFrameworkConfig,
): Record<string, unknown> => ({
  ...normalizedCase.raw,
  ...(config.target ? { target: config.target } : {}),
  ...(config.agentOptions ? { agent: config.agentOptions } : {}),
  tasks: normalizedCase.tasks,
});

export async function runBuiltinYamlCase(options: {
  agent: FrameworkAgent;
  normalizedCase: NormalizedYamlCase;
  config: MidsceneFrameworkConfig;
}): Promise<void> {
  await options.agent.runYaml(
    yaml.dump(mergeYamlCaseWithConfig(options.normalizedCase, options.config), {
      lineWidth: -1,
      noRefs: true,
    }),
  );
}
