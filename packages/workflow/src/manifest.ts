import { readFileSync } from 'node:fs';
import { WorkflowParseError } from './errors';
import type { WorkflowDocumentSource } from './parser/types';

export interface WorkflowRunManifest {
  version: 1;
  projectId: string;
  projectRoot: string;
  configPath?: string;
  sources: readonly WorkflowDocumentSource[];
  mode: 'serial' | 'parallel';
  maxConcurrency?: number;
  retry?: number;
  bail?: number;
  resultDir: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

export function validateWorkflowRunManifest(
  value: unknown,
): asserts value is WorkflowRunManifest {
  if (!isRecord(value) || value.version !== 1) {
    throw new WorkflowParseError('Workflow run manifest version must be 1.');
  }
  for (const key of ['projectId', 'projectRoot', 'resultDir'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new WorkflowParseError(`Workflow run manifest ${key} is required.`);
    }
  }
  if (value.configPath !== undefined && typeof value.configPath !== 'string') {
    throw new WorkflowParseError(
      'Workflow run manifest configPath must be a string.',
    );
  }
  if (value.mode !== 'serial' && value.mode !== 'parallel') {
    throw new WorkflowParseError(
      'Workflow run manifest mode must be serial or parallel.',
    );
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new WorkflowParseError(
      'Workflow run manifest sources must be a non-empty array.',
    );
  }
  for (const [index, source] of value.sources.entries()) {
    if (
      !isRecord(source) ||
      typeof source.projectId !== 'string' ||
      typeof source.sourcePath !== 'string' ||
      typeof source.absolutePath !== 'string'
    ) {
      throw new WorkflowParseError(
        `Workflow run manifest source ${index + 1} is invalid.`,
      );
    }
  }
  if (
    value.maxConcurrency !== undefined &&
    !positiveInteger(value.maxConcurrency)
  ) {
    throw new WorkflowParseError(
      'Workflow run manifest maxConcurrency must be a positive integer.',
    );
  }
  for (const key of ['retry', 'bail'] as const) {
    if (value[key] !== undefined && !nonNegativeInteger(value[key])) {
      throw new WorkflowParseError(
        `Workflow run manifest ${key} must be a non-negative integer.`,
      );
    }
  }
}

export function loadWorkflowRunManifest(path: string): WorkflowRunManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new WorkflowParseError(
      `Failed to load workflow run manifest "${path}".`,
      { path },
      error,
    );
  }
  validateWorkflowRunManifest(parsed);
  return parsed;
}
