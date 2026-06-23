import {
  AstBuilder,
  GherkinClassicTokenMatcher,
  Parser,
  compile,
} from '@cucumber/gherkin';
import {
  type FeatureChild,
  IdGenerator,
  type Pickle,
  type PickleStep,
  type Scenario,
  type Step,
} from '@cucumber/messages';
import type { MidsceneYamlScript } from '@midscene/core';

type ConcreteStepKeyword = 'Given' | 'When' | 'Then';
type StepKeyword = ConcreteStepKeyword | 'And' | 'But';

export interface CompiledFeatureScenario {
  caseId: string;
  scenarioName: string;
  testName: string;
  executionConfig: MidsceneYamlScript;
}

export const isFeatureFile = (file: string): boolean =>
  file.toLowerCase().endsWith('.feature');

const locationOf = (node: { location?: { line?: number } }): number =>
  node.location?.line ?? 1;

const lineError = (file: string, line: number, message: string): Error =>
  new Error(`${file}:${line}: ${message}`);

const parseGherkinDocument = (content: string, file: string) => {
  const newId = IdGenerator.incrementing();
  const parser = new Parser(
    new AstBuilder(newId),
    new GherkinClassicTokenMatcher(),
  );

  try {
    return parser.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${file}: Failed to parse feature file: ${message}`);
  }
};

const assertNoTags = (
  file: string,
  node: { tags?: readonly { location?: { line?: number } }[] },
) => {
  const tag = node.tags?.[0];
  if (!tag) return;

  throw lineError(
    file,
    locationOf(tag),
    'Tags are not supported by the Midscene feature runner',
  );
};

const assertNoDescription = (
  file: string,
  node: { description?: string; location?: { line?: number } },
  owner: string,
) => {
  if (!node.description?.trim()) return;

  throw lineError(
    file,
    locationOf(node),
    `${owner} descriptions are not supported by the Midscene feature runner`,
  );
};

const assertSupportedScenario = (file: string, scenario: Scenario) => {
  assertNoTags(file, scenario);
  assertNoDescription(file, scenario, 'Scenario');

  if (
    scenario.keyword !== 'Scenario' &&
    scenario.keyword !== 'Scenario Outline'
  ) {
    throw lineError(
      file,
      locationOf(scenario),
      `${scenario.keyword} is not supported by the Midscene feature runner`,
    );
  }

  for (const example of scenario.examples ?? []) {
    assertNoTags(file, example);
    assertNoDescription(file, example, 'Examples');
  }

  if (
    scenario.keyword === 'Scenario Outline' &&
    !scenario.examples?.some((example) => example.tableBody.length > 0)
  ) {
    throw lineError(
      file,
      locationOf(scenario),
      'Scenario Outline requires at least one Examples row',
    );
  }
};

const assertSupportedStep = (file: string, step: Step) => {
  if (step.dataTable) {
    throw lineError(
      file,
      locationOf(step.dataTable),
      'Data tables are not supported by the Midscene feature runner',
    );
  }

  if (step.docString) {
    throw lineError(
      file,
      locationOf(step.docString),
      'Doc strings are not supported by the Midscene feature runner',
    );
  }
};

const stepKeyword = (file: string, step: Step): StepKeyword => {
  const keyword = step.keyword.trim();
  switch (keyword) {
    case 'Given':
    case 'When':
    case 'Then':
    case 'And':
    case 'But':
      return keyword;
    default:
      throw lineError(
        file,
        locationOf(step),
        `Step keyword "${keyword}" is not supported by the Midscene feature runner`,
      );
  }
};

const validateSteps = (file: string, steps: readonly Step[] | undefined) => {
  for (const step of steps ?? []) {
    assertSupportedStep(file, step);
    stepKeyword(file, step);
  }
};

interface ScenarioInfo {
  id: string;
  name: string;
  ruleName?: string;
}

const collectScenarioInfo = (
  file: string,
  child: FeatureChild,
  ruleName?: string,
): ScenarioInfo[] => {
  if (child.background) {
    assertNoDescription(file, child.background, 'Background');
    validateSteps(file, child.background.steps);
    return [];
  }

  if (child.rule) {
    const rule = child.rule;
    assertNoTags(file, rule);
    assertNoDescription(file, rule, 'Rule');
    return rule.children.flatMap((ruleChild) =>
      collectScenarioInfo(file, ruleChild, rule.name),
    );
  }

  const scenario = child.scenario;
  if (!scenario) return [];

  assertSupportedScenario(file, scenario);
  validateSteps(file, scenario.steps);
  return [{ id: scenario.id, name: scenario.name, ruleName }];
};

const pickleStepToFlowItem = (step: PickleStep) => {
  switch (step.type) {
    case 'Outcome':
      return { aiAssert: step.text };
    case 'Context':
    case 'Action':
      return { aiAct: step.text };
    default:
      throw new Error(`Unsupported Gherkin step type: ${String(step.type)}`);
  }
};

const buildScenarioInfos = (
  file: string,
  document: ReturnType<typeof parseGherkinDocument>,
) => {
  const feature = document.feature;
  if (!feature) return [];
  return feature.children.flatMap((child) => collectScenarioInfo(file, child));
};

const caseIdOf = (pickle: Pickle): string => pickle.astNodeIds.join(':');

const logicalNameKey = (
  ruleName: string | undefined,
  scenarioName: string,
): string => `${ruleName ?? ''}\0${scenarioName}`;

const pickleNameCounts = (
  pickles: readonly Pickle[],
  scenarioInfoById: Map<string, ScenarioInfo>,
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const pickle of pickles) {
    const scenarioInfo = scenarioInfoById.get(pickle.astNodeIds[0]);
    const key = logicalNameKey(scenarioInfo?.ruleName, pickle.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export function compileFeatureFile(
  content: string,
  file: string,
): CompiledFeatureScenario[] {
  const document = parseGherkinDocument(content, file);
  const feature = document.feature;
  if (!feature?.name) {
    throw new Error(`${file}: Feature title is required`);
  }

  assertNoTags(file, feature);
  assertNoDescription(file, feature, 'Feature');

  const scenarioInfos = buildScenarioInfos(file, document);
  if (scenarioInfos.length === 0) {
    throw new Error(`${file}: At least one Scenario is required`);
  }
  const scenarioInfoById = new Map(
    scenarioInfos.map((info) => [info.id, info]),
  );

  const newId = IdGenerator.incrementing();
  const pickles = compile(document, file, newId);
  const nameCounts = pickleNameCounts(pickles, scenarioInfoById);
  const seenByName = new Map<string, number>();

  return pickles.map((pickle, index) => {
    const scenarioInfo = scenarioInfoById.get(pickle.astNodeIds[0]) ??
      scenarioInfos[index] ?? { id: pickle.id, name: pickle.name };
    const nameKey = logicalNameKey(scenarioInfo.ruleName, pickle.name);
    const occurrence = (seenByName.get(nameKey) ?? 0) + 1;
    seenByName.set(nameKey, occurrence);
    const scenarioName =
      (nameCounts.get(nameKey) ?? 0) > 1
        ? `${pickle.name} #${occurrence}`
        : pickle.name;
    const nameParts = [
      feature.name,
      scenarioInfo.ruleName,
      scenarioName,
    ].filter(Boolean);
    const flow = pickle.steps.map(pickleStepToFlowItem);
    return {
      caseId: caseIdOf(pickle),
      scenarioName,
      testName: nameParts.join(' > '),
      executionConfig: {
        tasks: [
          {
            name: scenarioName,
            flow,
          },
        ],
      },
    };
  });
}
