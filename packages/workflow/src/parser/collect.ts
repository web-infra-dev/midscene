import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { JSON_SCHEMA, load as loadYaml } from 'js-yaml';
import { WorkflowParseError } from '../errors';
import type { NodeDefinition } from '../node/types';
import { normalizeStep } from './normalize';
import type {
  CollectedWorkflow,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from './types';

export interface CollectWorkflowDocumentOptions {
  resolveNode(name: string): NodeDefinition<any, any> | undefined;
}

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

export const createWorkflowTestId = (
  projectId: string,
  sourcePath: string,
  workflowIndex: number,
): string =>
  createHash('sha256')
    .update(JSON.stringify([projectId, sourcePath, workflowIndex]))
    .digest('hex');

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
  rejectUnknownKeys(parsed, ['workflows'], 'Workflow document');
  if (!Array.isArray(parsed.workflows) || parsed.workflows.length === 0) {
    throw new WorkflowParseError(
      'Workflow document must contain a non-empty workflows array.',
    );
  }

  const sourcePath = source.sourcePath.split(sep).join('/');
  const ids = new Set<string>();
  const workflows: CollectedWorkflow[] = parsed.workflows.map(
    (definition, workflowIndex) => {
      if (!isMapping(definition)) {
        throw new WorkflowParseError(
          `Workflow ${workflowIndex + 1} must be a mapping.`,
          { workflowIndex },
        );
      }
      rejectUnknownKeys(
        definition,
        ['name', 'steps'],
        `Workflow ${workflowIndex + 1}`,
      );
      if (
        typeof definition.name !== 'string' ||
        definition.name.trim().length === 0
      ) {
        throw new WorkflowParseError(
          `Workflow ${workflowIndex + 1} name must be a non-empty string.`,
          { workflowIndex },
        );
      }
      if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
        throw new WorkflowParseError(
          `Workflow ${workflowIndex + 1} steps must be a non-empty array.`,
          { workflowIndex },
        );
      }

      const steps = definition.steps.map((step, stepIndex) => {
        const normalized = normalizeStep(step, stepIndex);
        if (!options.resolveNode(normalized.node)) {
          throw new WorkflowParseError(
            `Workflow ${workflowIndex + 1} step ${stepIndex + 1} references unknown node "${normalized.node}".`,
            { workflowIndex, stepIndex, node: normalized.node },
          );
        }
        return normalized;
      });
      const testId = createWorkflowTestId(
        source.projectId,
        sourcePath,
        workflowIndex,
      );
      if (ids.has(testId)) {
        throw new WorkflowParseError(`Workflow testId collision: ${testId}.`, {
          testId,
        });
      }
      ids.add(testId);

      return {
        testId,
        projectId: source.projectId,
        sourcePath,
        workflowIndex,
        definition: { name: definition.name, steps },
      };
    },
  );

  return {
    projectId: source.projectId,
    sourcePath,
    workflows,
  } satisfies CollectedWorkflowDocument;
}
