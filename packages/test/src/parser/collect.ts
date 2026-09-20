import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { classifyWorkflowDocumentFormat } from '@midscene/core/internal/test-runner';
import { JSON_SCHEMA, load as loadYaml } from 'js-yaml';
import type { JsonValue } from '../cli/test-project';
import { WorkflowParseError } from '../errors';
import type { NodeDefinition } from '../node/types';
import {
  createCaseInvocationId,
  createDocumentInvocationId,
} from './identifiers';
import { normalizeSteps } from './normalize';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from './types';
import { resolveWorkflowVariables } from './variables';

export interface CollectWorkflowDocumentOptions {
  resolveNode(name: string): NodeDefinition<any, any> | undefined;
  variables?: Readonly<Record<string, JsonValue>>;
  env?: Readonly<NodeJS.ProcessEnv>;
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class NativeWorkflowFormatError extends WorkflowParseError {
  readonly actualFormat: 'legacy' | 'legacy-batch' | 'mixed';

  constructor(
    actualFormat: 'legacy' | 'legacy-batch' | 'mixed',
    sourcePath: string,
  ) {
    super(
      actualFormat === 'legacy'
        ? `Legacy tasks/flow YAML is not supported by midscene-test: ${sourcePath}. Run it with \`midscene ${sourcePath}\`, or migrate the file to cases/steps.`
        : actualFormat === 'legacy-batch'
          ? `Legacy YAML batch configuration is not a midscene-test workflow document: ${sourcePath}. Run it with \`midscene --config ${sourcePath}\`, or migrate it to a native project config.`
          : `A workflow file cannot mix legacy tasks/flow with native cases/steps or lifecycle hooks: ${sourcePath}. Keep the formats in separate files and run each file with its matching command.`,
      { sourcePath, actualFormat, expectedFormat: 'native' },
    );
    this.actualFormat = actualFormat;
  }
}

const rejectUnknownKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) => {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) {
    throw new WorkflowParseError(
      `${label} has unsupported field "${unknown[0]}".`,
      { field: unknown[0] },
    );
  }
};

export const createCaseId = (
  projectId: string,
  sourcePath: string,
  caseIndex: number,
): string => createCaseInvocationId(projectId, sourcePath, caseIndex);

export const createWorkflowDocumentId = (
  projectId: string,
  sourcePath: string,
): string => createDocumentInvocationId(projectId, sourcePath);

export function collectWorkflowDocument(
  source: WorkflowDocumentSource,
  options: CollectWorkflowDocumentOptions,
): CollectedWorkflowDocument {
  let parsed: unknown;
  try {
    parsed = loadYaml(readFileSync(source.absolutePath, 'utf8'), {
      schema: JSON_SCHEMA,
    });
  } catch (error) {
    throw new WorkflowParseError(
      `Failed to parse workflow document "${source.sourcePath}".`,
      { sourcePath: source.sourcePath },
      error,
    );
  }

  if (!isMapping(parsed)) {
    throw new WorkflowParseError('Workflow document must be a mapping.');
  }
  const format = classifyWorkflowDocumentFormat(parsed);
  if (format === 'legacy' || format === 'legacy-batch' || format === 'mixed') {
    throw new NativeWorkflowFormatError(format, source.sourcePath);
  }
  rejectUnknownKeys(
    parsed,
    ['beforeAll', 'beforeEach', 'cases', 'afterEach', 'afterAll'],
    'Workflow document',
  );
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new WorkflowParseError(
      'Workflow document must contain a non-empty cases array.',
    );
  }

  const sourcePath = source.sourcePath.split(sep).join('/');
  const resolveStepVariables = (
    step: ReturnType<typeof normalizeSteps>[number],
    phase: 'beforeAll' | 'beforeEach' | 'steps' | 'afterEach' | 'afterAll',
    stepIndex: number,
    caseIndex?: number,
  ) => ({
    ...step,
    input: resolveWorkflowVariables(step.input, {
      variables: options.variables,
      env: options.env ?? process.env,
      location: {
        projectName: source.projectName ?? source.projectId,
        sourcePath,
        phase,
        stepIndex,
        ...(caseIndex === undefined ? {} : { caseIndex }),
      },
    }) as typeof step.input,
  });
  const normalizeLifecycle = (
    phase: 'beforeAll' | 'beforeEach' | 'afterEach' | 'afterAll',
  ) => {
    const value = parsed[phase];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new WorkflowParseError(
        `Workflow document ${phase} must be an array.`,
        { phase },
      );
    }
    return normalizeSteps(value, options.resolveNode).map(
      (normalized, stepIndex) => {
        const resolved = options.resolveNode(normalized.node);
        if (!resolved) {
          throw new WorkflowParseError(
            `Workflow document ${phase} step ${stepIndex + 1} references unknown node "${normalized.node}".`,
            { phase, stepIndex, node: normalized.node },
          );
        }
        return resolveStepVariables(normalized, phase, stepIndex);
      },
    );
  };
  const lifecycle = {
    beforeAll: normalizeLifecycle('beforeAll'),
    beforeEach: normalizeLifecycle('beforeEach'),
    afterEach: normalizeLifecycle('afterEach'),
    afterAll: normalizeLifecycle('afterAll'),
  };
  const ids = new Set<string>();
  const cases: CollectedCase[] = parsed.cases.map((definition, caseIndex) => {
    if (!isMapping(definition)) {
      throw new WorkflowParseError(`Case ${caseIndex + 1} must be a mapping.`, {
        caseIndex,
      });
    }
    rejectUnknownKeys(
      definition,
      ['name', 'tags', 'steps'],
      `Case ${caseIndex + 1}`,
    );
    if (
      typeof definition.name !== 'string' ||
      definition.name.trim().length === 0
    ) {
      throw new WorkflowParseError(
        `Case ${caseIndex + 1} name must be a non-empty string.`,
        { caseIndex },
      );
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      throw new WorkflowParseError(
        `Case ${caseIndex + 1} steps must be a non-empty array.`,
        { caseIndex },
      );
    }
    const tags = definition.tags ?? [];
    if (
      !Array.isArray(tags) ||
      tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)
    ) {
      throw new WorkflowParseError(
        `Case ${caseIndex + 1} tags must be an array of non-empty strings.`,
        { caseIndex },
      );
    }

    const steps = normalizeSteps(definition.steps, options.resolveNode).map(
      (normalized, stepIndex) => {
        if (!options.resolveNode(normalized.node)) {
          throw new WorkflowParseError(
            `Case ${caseIndex + 1} step ${stepIndex + 1} references unknown node "${normalized.node}".`,
            { caseIndex, stepIndex, node: normalized.node },
          );
        }
        return resolveStepVariables(normalized, 'steps', stepIndex, caseIndex);
      },
    );
    const caseId = createCaseId(source.projectId, sourcePath, caseIndex);
    if (ids.has(caseId)) {
      throw new WorkflowParseError(`Case id collision: ${caseId}.`, {
        caseId,
      });
    }
    ids.add(caseId);

    return {
      caseId,
      projectId: source.projectId,
      sourcePath,
      caseIndex,
      definition: {
        name: definition.name,
        tags: tags as string[],
        steps,
      },
    };
  });

  return {
    documentId: createWorkflowDocumentId(source.projectId, sourcePath),
    projectId: source.projectId,
    sourcePath,
    lifecycle,
    cases,
  } satisfies CollectedWorkflowDocument;
}
