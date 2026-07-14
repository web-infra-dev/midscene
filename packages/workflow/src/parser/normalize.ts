import { JSON_SCHEMA, load as loadYaml } from 'js-yaml';
import { WorkflowParseError } from '../errors';
import type {
  CommonNodeInput,
  LegacyWorkflowDefinition,
  NormalizedStep,
  NormalizedStepMeta,
  NormalizedWorkflow,
  WorkflowSource,
} from './types';

const supportedMetaKeys = new Set(['timeout', 'continue-on-error']);

function isMapping(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function formatStep(index: number): string {
  return `workflow step ${index + 1}`;
}

function normalizeMeta(value: unknown, index: number): NormalizedStepMeta {
  if (value === undefined) {
    return { continueOnError: false };
  }

  if (!isMapping(value)) {
    throw new WorkflowParseError(
      `${formatStep(index)} "$" must be a mapping.`,
      { index },
    );
  }

  for (const key of Object.keys(value)) {
    if (!supportedMetaKeys.has(key)) {
      throw new WorkflowParseError(
        `${formatStep(index)} has unsupported engine metadata "${key}".`,
        { index, key },
      );
    }
  }

  const timeout = value.timeout;
  if (
    timeout !== undefined &&
    (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
  ) {
    throw new WorkflowParseError(
      `${formatStep(index)} "$.timeout" must be a positive number of milliseconds.`,
      { index, timeout },
    );
  }

  const continueOnError = value['continue-on-error'];
  if (continueOnError !== undefined && typeof continueOnError !== 'boolean') {
    throw new WorkflowParseError(
      `${formatStep(index)} "$.continue-on-error" must be a boolean.`,
      { index, continueOnError },
    );
  }

  return {
    ...(timeout === undefined ? {} : { timeoutMs: timeout }),
    continueOnError: continueOnError ?? false,
  };
}

export function validateCommonNodeInput(
  input: Record<string, unknown>,
  index: number,
): asserts input is Record<string, unknown> & CommonNodeInput {
  if (input.prompt !== undefined && typeof input.prompt !== 'string') {
    throw new WorkflowParseError(
      `${formatStep(index)} "prompt" must be a string.`,
      { index, prompt: input.prompt },
    );
  }
}

export function parseWorkflow(source: string): LegacyWorkflowDefinition {
  if (typeof source !== 'string') {
    throw new WorkflowParseError('Workflow YAML source must be a string.');
  }

  try {
    return loadYaml(source, {
      schema: JSON_SCHEMA,
    }) as LegacyWorkflowDefinition;
  } catch (error) {
    throw new WorkflowParseError(
      'Failed to parse workflow YAML.',
      undefined,
      error,
    );
  }
}

export function normalizeStep(value: unknown, index = 0): NormalizedStep {
  if (!isMapping(value)) {
    throw new WorkflowParseError(`${formatStep(index)} must be a mapping.`, {
      index,
    });
  }

  const entries = Object.entries(value);
  if (entries.length !== 1) {
    throw new WorkflowParseError(
      `${formatStep(index)} must contain exactly one node.`,
      { index, nodes: Object.keys(value) },
    );
  }

  const [node, rawValue] = entries[0];
  if (node.trim().length === 0) {
    throw new WorkflowParseError(
      `${formatStep(index)} node name must not be empty.`,
      { index },
    );
  }

  if (typeof rawValue === 'string') {
    return {
      node,
      input: { prompt: rawValue },
      meta: { continueOnError: false },
    };
  }

  if (!isMapping(rawValue)) {
    throw new WorkflowParseError(
      `${formatStep(index)} value must be a string shorthand or a mapping.`,
      { index, node },
    );
  }

  const { $: rawMeta, ...input } = rawValue;
  validateCommonNodeInput(input, index);

  return {
    node,
    input,
    meta: normalizeMeta(rawMeta, index),
  };
}

export function normalizeWorkflow(source: WorkflowSource): NormalizedWorkflow {
  const definition =
    typeof source === 'string' ? parseWorkflow(source) : source;

  if (!isMapping(definition)) {
    throw new WorkflowParseError('Workflow definition must be a mapping.');
  }

  if (!Array.isArray(definition.workflow)) {
    throw new WorkflowParseError(
      'Workflow definition must contain a workflow array.',
    );
  }

  return {
    workflow: definition.workflow.map((step, index) =>
      normalizeStep(step, index),
    ),
  };
}
