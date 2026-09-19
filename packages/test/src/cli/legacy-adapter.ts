import { relative, sep } from 'node:path';
import type {
  MidsceneYamlScript,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '@midscene/core/internal/test-runner';
import { collectLegacyYamlDocument } from '@midscene/core/internal/yaml-runtime';
import merge from 'lodash.merge';
import {
  createCaseInvocationId as createCaseId,
  createDocumentInvocationId as createWorkflowDocumentId,
} from '../parser/identifiers';
import type { LegacyTestRunPlan } from '../runtime/legacy-config';

export interface LegacyWorkflow {
  source: WorkflowDocumentSource;
  script: MidsceneYamlScript;
  sourceConfig: MidsceneYamlScript;
  document: CollectedWorkflowDocument;
}

export interface AdaptedLegacyExecutionPlan {
  project: {
    name: string;
    files: {
      include: string[];
    };
    retry: number;
  };
  bail: number;
}

/** Select a Project label; legacy scheduling remains in the compatibility plan. */
export function adaptLegacyExecutionPlan(
  plan: LegacyTestRunPlan,
  projectRoot: string,
): AdaptedLegacyExecutionPlan {
  const projectPath = (path: string) =>
    relative(projectRoot, path).split(sep).join('/');
  return {
    bail: plan.bail,
    project: {
      name: 'legacy',
      files: {
        include: plan.files.map(projectPath),
      },
      retry: plan.retry,
    },
  };
}

/**
 * Frozen legacy contract adapter. It only maps a parsed old YAML config to the
 * public execution model; I/O, scheduling, resources and publication live in
 * their respective Test layers.
 */
export function adaptLegacyWorkflow(
  source: WorkflowDocumentSource,
  sourceConfig: MidsceneYamlScript,
  globalConfig?: MidsceneYamlTargetConfig,
): LegacyWorkflow {
  const script = globalConfig
    ? merge({}, sourceConfig, globalConfig)
    : sourceConfig;
  const collected = collectLegacyYamlDocument(script, source.sourcePath);
  const document: CollectedWorkflowDocument = {
    ...collected,
    documentId: createWorkflowDocumentId(
      source.projectId,
      source.sourcePath,
      source.invocationIndex,
    ),
    projectId: source.projectId,
    cases: collected.cases.map((item) => ({
      ...item,
      projectId: source.projectId,
      caseId: createCaseId(
        source.projectId,
        source.sourcePath,
        item.caseIndex,
        source.invocationIndex,
      ),
    })),
  };
  return { source, script, sourceConfig, document };
}
