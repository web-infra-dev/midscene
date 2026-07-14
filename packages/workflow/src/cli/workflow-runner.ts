import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { createDocumentRuntime } from '../engine/document-runtime';
import { runWorkflow } from '../engine/run-workflow';
import type { WorkflowDocumentRunResult } from '../engine/types';
import { WorkflowError, WorkflowParseError } from '../errors';
import { collectWorkflowDocument } from '../parser/collect';
import type {
  CollectedWorkflow,
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  writeCollectionError,
  writeWorkflowDocumentRunResult,
  writeWorkflowProjectRunResult,
  writeWorkflowRunResult,
} from './result-store';
import type {
  WorkflowCaseRunResult,
  WorkflowCollectionError,
  WorkflowProjectRunResult,
  WorkflowProjectRunSummary,
} from './types';
import { loadWorkflowProjectSync } from './workflow-project';

const CONFIG_NAMES = [
  'midscene.workflow.config.cjs',
  'midscene.workflow.config.js',
];
const SKIPPED_DIRECTORIES = new Set(['.git', '.midscene', 'node_modules']);

const toPosix = (value: string): string => value.split(sep).join('/');

export interface WorkflowProjectRunOptions {
  projectRoot: string;
  configPath?: string;
  resultDir?: string;
}

interface CollectedProjectDocument {
  document: CollectedWorkflowDocument;
}

export const discoverWorkflowFiles = (projectRoot: string): string[] => {
  const root = resolve(projectRoot);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          visit(join(directory, entry.name));
        }
        continue;
      }
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  };
  visit(root);
  return files.sort((a, b) =>
    toPosix(relative(root, a)).localeCompare(toPosix(relative(root, b))),
  );
};

export const discoverWorkflowConfig = (
  projectRoot: string,
): string | undefined =>
  CONFIG_NAMES.map((name) => join(resolve(projectRoot), name)).find(existsSync);

const defaultResultDir = (projectRoot: string): string =>
  join(
    projectRoot,
    '.midscene',
    'workflow-results',
    `${Date.now()}-${process.pid}`,
  );

const asCollectionError = (
  sourcePath: string,
  error: unknown,
): WorkflowCollectionError => ({
  sourcePath,
  error:
    error instanceof WorkflowError
      ? error
      : new WorkflowParseError(
          `Failed to collect workflow document "${sourcePath}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          { sourcePath },
          error,
        ),
});

const asNotRun = (
  workflow: CollectedWorkflow,
  reason: NonNullable<WorkflowCaseRunResult['notRunReason']>,
): WorkflowCaseRunResult => ({
  testId: workflow.testId,
  name: workflow.definition.name,
  sourcePath: workflow.sourcePath,
  workflowIndex: workflow.workflowIndex,
  status: 'not-run',
  notRunReason: reason,
});

const summarize = (
  workflows: readonly WorkflowCaseRunResult[],
  documents: readonly WorkflowDocumentRunResult[],
  collectionErrors: readonly WorkflowCollectionError[],
): WorkflowProjectRunSummary => ({
  total: workflows.length,
  passed: workflows.filter((workflow) => workflow.status === 'success').length,
  failed: workflows.filter((workflow) => workflow.status === 'failed').length,
  notRun: workflows.filter((workflow) => workflow.status === 'not-run').length,
  collectionErrors: collectionErrors.length,
  documentFailures: documents.filter((document) => document.status === 'failed')
    .length,
});

export async function runWorkflowProject(
  options: WorkflowProjectRunOptions,
): Promise<WorkflowProjectRunResult> {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    throw new Error(
      `Workflow project directory does not exist: ${projectRoot}`,
    );
  }
  const files = discoverWorkflowFiles(projectRoot);
  if (files.length === 0) {
    throw new Error(`No workflow YAML files found in ${projectRoot}.`);
  }
  const resultDir = resolve(options.resultDir ?? defaultResultDir(projectRoot));
  const configPath = options.configPath
    ? resolve(projectRoot, options.configPath)
    : discoverWorkflowConfig(projectRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Workflow config does not exist: ${configPath}`);
  }
  mkdirSync(resultDir, { recursive: true });

  const projectId = basename(projectRoot);
  const sources: WorkflowDocumentSource[] = files.map((absolutePath) => ({
    projectId,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
  const project = loadWorkflowProjectSync(configPath);
  const collectedDocuments: CollectedProjectDocument[] = [];
  const collectionErrors: WorkflowCollectionError[] = [];
  const collectedTestIds = new Set<string>();

  for (const source of sources) {
    try {
      const document = collectWorkflowDocument(source, {
        resolveNode: project.resolveNode,
        resolveDocumentNode: project.resolveDocumentNode,
      });
      const collided = document.workflows.find((workflow) =>
        collectedTestIds.has(workflow.testId),
      );
      if (collided) {
        throw new WorkflowParseError(
          `Workflow testId collision: ${collided.testId}.`,
          { testId: collided.testId, sourcePath: source.sourcePath },
        );
      }
      for (const workflow of document.workflows) {
        collectedTestIds.add(workflow.testId);
      }
      collectedDocuments.push({ document });
    } catch (error) {
      const collectionError = asCollectionError(source.sourcePath, error);
      collectionErrors.push(collectionError);
      writeCollectionError(resultDir, collectionError);
    }
  }

  const workflows: WorkflowCaseRunResult[] = [];
  const documents: WorkflowDocumentRunResult[] = [];
  let interrupted = false;
  const handleSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    for (const { document } of collectedDocuments) {
      if (interrupted) {
        workflows.push(
          ...document.workflows.map((workflow) =>
            asNotRun(workflow, 'interrupted'),
          ),
        );
        continue;
      }

      const runtime = createDocumentRuntime(document, {
        resolveNode: project.documentNodes.require.bind(project.documentNodes),
        setupDocument: project.setupDocument,
      });
      let runtimeStarted = false;
      let executionError: unknown;
      try {
        runtimeStarted = true;
        await runtime.start();

        if (!runtime.canRunWorkflows) {
          workflows.push(
            ...document.workflows.map((workflow) =>
              asNotRun(workflow, 'document-start-failed'),
            ),
          );
        } else {
          for (const workflow of document.workflows) {
            if (interrupted) {
              workflows.push(asNotRun(workflow, 'interrupted'));
              continue;
            }
            const run = await runWorkflow(workflow, {
              resolveNode: project.nodes.require.bind(project.nodes),
              beforeEach: document.lifecycle.beforeEach,
              afterEach: document.lifecycle.afterEach,
              context: runtime.context,
            });
            writeWorkflowRunResult(resultDir, run);
            workflows.push({
              testId: workflow.testId,
              name: workflow.definition.name,
              sourcePath: workflow.sourcePath,
              workflowIndex: workflow.workflowIndex,
              status: run.status,
              run,
            });
          }
        }
      } catch (error) {
        executionError = error;
      } finally {
        if (runtimeStarted) {
          try {
            const documentResult = await runtime.finish();
            documents.push(documentResult);
            writeWorkflowDocumentRunResult(resultDir, documentResult);
          } catch (error) {
            executionError ??= error;
          }
        }
      }
      if (executionError) throw executionError;
    }
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  }

  const summary = summarize(workflows, documents, collectionErrors);
  const failed =
    interrupted ||
    summary.failed > 0 ||
    summary.notRun > 0 ||
    summary.collectionErrors > 0 ||
    summary.documentFailures > 0;
  const result: WorkflowProjectRunResult = {
    status: failed ? 'failed' : 'success',
    exitCode: failed ? 1 : 0,
    resultDir,
    summary,
    workflows,
    documents,
    collectionErrors,
  };
  writeWorkflowProjectRunResult(resultDir, {
    projectId,
    projectRoot,
    ...(configPath ? { configPath } : {}),
    sources,
    result,
  });
  return result;
}
