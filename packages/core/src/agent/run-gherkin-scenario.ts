import type { AiActOptions } from './agent';

export type GherkinStepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

type RunGherkinScenarioStepAction = 'aiAct' | 'aiAssert';

export type RunGherkinScenarioOptions = AiActOptions & {
  context?: string;
};

type GherkinPrimaryKeyword = 'Given' | 'When' | 'Then';

type ParsedGherkinStep = {
  keyword: GherkinStepKeyword;
  effectiveKeyword: GherkinPrimaryKeyword;
  text: string;
  lineNumber: number;
};

type RawGherkinStep = {
  keyword: GherkinStepKeyword;
  text: string;
  lineNumber: number;
};

type ParsedGherkinScenario = {
  scenario?: string;
  steps: ParsedGherkinStep[];
};

type GherkinScenarioAgent = {
  aiAct: (taskPrompt: string, opt?: AiActOptions) => Promise<unknown>;
  aiAssert: (
    assertion: string,
    msg?: string,
    opt?: { context?: string; abortSignal?: AbortSignal },
  ) => Promise<unknown>;
};

const stepKeywordPattern = /^(Given|When|Then|And|But)\s+(.+)$/i;
const headerPattern = /^(Scenario):\s*(.*)$/i;
const unsupportedHeaderPattern =
  /^(Feature|Background|Scenario Outline|Scenario Template|Examples|Rule):/i;

const normalizeStepKeyword = (keyword: string): GherkinStepKeyword => {
  const lowerKeyword = keyword.toLowerCase();
  if (lowerKeyword === 'given') return 'Given';
  if (lowerKeyword === 'when') return 'When';
  if (lowerKeyword === 'then') return 'Then';
  if (lowerKeyword === 'and') return 'And';
  return 'But';
};

const isPrimaryKeyword = (
  keyword: GherkinStepKeyword,
): keyword is GherkinPrimaryKeyword => {
  return keyword === 'Given' || keyword === 'When' || keyword === 'Then';
};

const resolveSteps = (steps: RawGherkinStep[]): ParsedGherkinStep[] => {
  let previousPrimaryKeyword: GherkinPrimaryKeyword | undefined;

  return steps.map((step) => {
    const effectiveKeyword = isPrimaryKeyword(step.keyword)
      ? step.keyword
      : previousPrimaryKeyword;

    if (!effectiveKeyword) {
      throw new Error(
        `runGherkinScenario cannot resolve "${step.keyword}" at line ${step.lineNumber}; use Given, When, or Then before ${step.keyword}.`,
      );
    }

    previousPrimaryKeyword = effectiveKeyword;

    return {
      ...step,
      effectiveKeyword,
    };
  });
};

const throwIfAborted = (abortSignal: AbortSignal | undefined) => {
  if (!abortSignal?.aborted) {
    return;
  }

  if (typeof abortSignal.throwIfAborted === 'function') {
    abortSignal.throwIfAborted();
  }

  throw new Error(
    `runGherkinScenario aborted: ${abortSignal.reason || 'signal already aborted'}`,
  );
};

export const parseGherkinScenario = (
  scenarioText: string,
): ParsedGherkinScenario => {
  const lines = scenarioText.split(/\r?\n/);
  const scenarioSteps: RawGherkinStep[] = [];
  const anonymousSteps: RawGherkinStep[] = [];
  let scenario: string | undefined;
  let scenarioCount = 0;
  let section: 'prelude' | 'scenario' = 'prelude';

  for (const [lineIndex, rawLine] of lines.entries()) {
    const lineNumber = lineIndex + 1;
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith('@')) {
      continue;
    }

    if (line === '"""' || line === "'''") {
      throw new Error(
        `runGherkinScenario does not support doc strings; found one at line ${lineNumber}.`,
      );
    }

    if (line.startsWith('|')) {
      throw new Error(
        `runGherkinScenario does not support data tables; found one at line ${lineNumber}.`,
      );
    }

    if (unsupportedHeaderPattern.test(line)) {
      throw new Error(
        `runGherkinScenario does not support "${line}" at line ${lineNumber}.`,
      );
    }

    const headerMatch = line.match(headerPattern);
    if (headerMatch) {
      scenarioCount += 1;
      scenario = headerMatch[2].trim() || undefined;
      section = 'scenario';
      continue;
    }

    const stepMatch = line.match(stepKeywordPattern);
    if (stepMatch) {
      const step = {
        keyword: normalizeStepKeyword(stepMatch[1]),
        text: stepMatch[2].trim(),
        lineNumber,
      };

      if (section === 'scenario') {
        scenarioSteps.push(step);
      } else {
        anonymousSteps.push(step);
      }

      continue;
    }

    throw new Error(
      `runGherkinScenario does not support content at line ${lineNumber}: ${line}`,
    );
  }

  if (scenarioCount > 1) {
    throw new Error(
      `runGherkinScenario expects exactly one Scenario, but found ${scenarioCount}.`,
    );
  }

  if (scenarioCount === 1 && anonymousSteps.length > 0) {
    throw new Error(
      'runGherkinScenario cannot mix anonymous steps with a Scenario block.',
    );
  }

  const rawSteps = scenarioCount === 1 ? scenarioSteps : anonymousSteps;

  if (rawSteps.length === 0) {
    throw new Error('runGherkinScenario requires at least one Gherkin step.');
  }

  return {
    scenario,
    steps: resolveSteps(rawSteps),
  };
};

const buildStepPrompt = (step: ParsedGherkinStep) => {
  if (step.effectiveKeyword === 'Given') {
    return `Set up this precondition: ${step.text}`;
  }

  if (step.effectiveKeyword === 'When') {
    return `Perform this user action: ${step.text}`;
  }

  return `Verify that ${step.text}`;
};

const describeStepExecution = (
  step: ParsedGherkinStep,
  action: RunGherkinScenarioStepAction,
) => {
  const keywordMapping =
    step.keyword === step.effectiveKeyword
      ? step.keyword
      : `${step.keyword} as ${step.effectiveKeyword}`;

  if (step.effectiveKeyword === 'Given') {
    return `setting up the precondition (${keywordMapping} -> ${action})`;
  }

  if (step.effectiveKeyword === 'When') {
    return `performing the user action (${keywordMapping} -> ${action})`;
  }

  return `verifying the expected result (${keywordMapping} -> ${action})`;
};

const describeErrorCause = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return ` Original error: ${error.message}`;
  }

  return '';
};

export const runGherkinScenario = async (
  agent: GherkinScenarioAgent,
  scenarioText: string,
  opt?: RunGherkinScenarioOptions,
): Promise<void> => {
  const parsedScenario = parseGherkinScenario(scenarioText);
  const aiActOptions: AiActOptions = {
    ...opt,
    cacheable: false,
  };

  for (const step of parsedScenario.steps) {
    throwIfAborted(opt?.abortSignal);

    const action: RunGherkinScenarioStepAction =
      step.effectiveKeyword === 'Then' ? 'aiAssert' : 'aiAct';
    const prompt = buildStepPrompt(step);

    try {
      if (action === 'aiAct') {
        await agent.aiAct(prompt, aiActOptions);
      } else if (opt?.context || opt?.abortSignal) {
        await agent.aiAssert(prompt, undefined, {
          context: opt.context,
          abortSignal: opt.abortSignal,
        });
      } else {
        await agent.aiAssert(prompt);
      }
    } catch (error) {
      throw new Error(
        `runGherkinScenario failed while ${describeStepExecution(
          step,
          action,
        )} at line ${step.lineNumber}: ${step.keyword} ${step.text}.${describeErrorCause(
          error,
        )}`,
        {
          cause: error,
        },
      );
    }
  }
};
