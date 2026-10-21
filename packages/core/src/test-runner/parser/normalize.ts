import { WorkflowParseError } from '../errors';
import type { NormalizedStep, NormalizedStepMeta } from './types';

interface StringInputNodeDefinition {
  stringInputKey?: string | false;
}

export type ResolveNodeForNormalization = (
  name: string,
) => StringInputNodeDefinition | undefined;

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
  return `step ${index + 1}`;
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

export function normalizeStep(
  value: unknown,
  index = 0,
  resolveNode?: ResolveNodeForNormalization,
): NormalizedStep {
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
    const resolvedNode = resolveNode?.(node);
    const stringInputKey = resolvedNode
      ? resolvedNode.stringInputKey
      : 'prompt';
    if (stringInputKey === false || stringInputKey === undefined) {
      throw new WorkflowParseError(
        `${formatStep(index)} node "${node}" does not accept string shorthand.`,
        { index, node },
      );
    }
    return {
      node,
      input: { [stringInputKey]: rawValue },
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

  return {
    node,
    input,
    meta: normalizeMeta(rawMeta, index),
  };
}

export function normalizeSteps(
  steps: unknown,
  resolveNode?: ResolveNodeForNormalization,
): NormalizedStep[] {
  if (!Array.isArray(steps)) {
    throw new WorkflowParseError('Steps must be an array.');
  }
  return steps.map((step, index) => normalizeStep(step, index, resolveNode));
}
