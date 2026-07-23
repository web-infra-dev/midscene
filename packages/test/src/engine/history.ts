import { NodeExecutionError } from '../errors';
import type { NodeHistoryEntry, StepRunResult } from './types';

export const assertJsonSerializable = (
  value: unknown,
  label: string,
  node: string,
): void => {
  const visit = (
    candidate: unknown,
    path: string,
    seen: Set<unknown>,
  ): void => {
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate)) return;
      throw new TypeError(`${path} contains a non-finite number.`);
    }
    if (candidate === undefined) {
      throw new TypeError(`${path} contains undefined.`);
    }
    if (typeof candidate !== 'object') {
      throw new TypeError(`${path} is not JSON-serializable.`);
    }
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    ) {
      throw new TypeError(`${path} must contain only plain objects.`);
    }
    if (seen.has(candidate)) throw new TypeError(`${path} contains a cycle.`);
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) =>
        visit(child, `${path}[${index}]`, seen),
      );
    } else {
      for (const [key, child] of Object.entries(candidate)) {
        visit(child, `${path}.${key}`, seen);
      }
    }
    seen.delete(candidate);
  };

  try {
    visit(value, label, new Set());
  } catch (error) {
    throw new NodeExecutionError(node, error);
  }
};

const cloneAndFreezeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreezeJson));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          cloneAndFreezeJson(child),
        ]),
      ),
    );
  }
  return value;
};

export const toHistoryEntry = (
  result: StepRunResult,
  scope: NodeHistoryEntry['scope'],
): NodeHistoryEntry => {
  assertJsonSerializable(result.input, 'input', result.node);
  if (result.output?.data !== undefined) {
    assertJsonSerializable(result.output.data, 'output.data', result.node);
  }
  return Object.freeze({
    scope,
    phase: result.phase,
    stepIndex: result.stepIndex,
    node: result.node,
    input: cloneAndFreezeJson(result.input),
    ...(typeof (result.input as { prompt?: unknown })?.prompt === 'string'
      ? { intent: (result.input as { prompt: string }).prompt }
      : {}),
    status: result.status === 'success' ? 'passed' : 'failed',
    ...(result.output?.summary === undefined
      ? {}
      : { summary: result.output.summary }),
    ...(result.output?.data === undefined
      ? {}
      : { data: cloneAndFreezeJson(result.output.data) }),
    ...(result.error
      ? {
          error: Object.freeze({
            name: result.error.name,
            message: result.error.message,
          }),
        }
      : {}),
  });
};

export const createHistory = (
  prefix: readonly NodeHistoryEntry[],
  results: readonly StepRunResult[],
  scope: NodeHistoryEntry['scope'],
): readonly NodeHistoryEntry[] =>
  Object.freeze([
    ...prefix,
    ...results.map((result) => toHistoryEntry(result, scope)),
  ]);
