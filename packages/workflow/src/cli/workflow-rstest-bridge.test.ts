import { afterAll, beforeAll, describe, test } from '@rstest/core';
import { createDocumentRuntime } from '../engine/document-runtime';
import { runWorkflow } from '../engine/run-workflow';
import {
  WorkflowDocumentExecutionError,
  WorkflowExecutionError,
} from '../errors';
import { loadWorkflowRunManifest } from '../manifest';
import { collectWorkflowDocument } from '../parser/collect';
import {
  writeCollectionError,
  writeRstestTestMapping,
  writeWorkflowDocumentRunResult,
  writeWorkflowRunResult,
} from './result-store';
import { loadWorkflowProjectSync } from './workflow-project';

const manifestPath = process.env.MIDSCENE_WORKFLOW_MANIFEST;
if (!manifestPath) {
  throw new Error('MIDSCENE_WORKFLOW_MANIFEST is required.');
}

const manifest = loadWorkflowRunManifest(manifestPath);
const project = loadWorkflowProjectSync(manifest.configPath);
const collectedTestIds = new Set<string>();

for (const source of manifest.sources) {
  describe(source.sourcePath, () => {
    let document;
    try {
      document = collectWorkflowDocument(source, {
        resolveNode: project.resolveNode,
        resolveDocumentNode: project.resolveDocumentNode,
      });
    } catch (error) {
      writeCollectionError(manifest.resultDir, source.sourcePath, error);
      const collectionError = error;
      test.sequential(source.sourcePath, () => {
        throw collectionError;
      });
      return;
    }

    const collided = document.workflows.find((workflow) =>
      collectedTestIds.has(workflow.testId),
    );
    if (collided) {
      const collision = new Error(
        `Workflow testId collision: ${collided.testId}.`,
      );
      writeCollectionError(manifest.resultDir, source.sourcePath, collision);
      test.sequential(source.sourcePath, () => {
        throw collision;
      });
      return;
    }
    for (const workflow of document.workflows) {
      collectedTestIds.add(workflow.testId);
    }

    const runtime = createDocumentRuntime(document, {
      resolveNode: project.documentNodes.require.bind(project.documentNodes),
      setupDocument: project.setupDocument,
    });

    beforeAll(async () => {
      const result = await runtime.start();
      if (result.status === 'failed') {
        throw new WorkflowDocumentExecutionError(result);
      }
    });

    for (const workflow of document.workflows) {
      const defineTest =
        manifest.mode === 'parallel' ? test.concurrent : test.sequential;
      defineTest(
        workflow.definition.name,
        async ({ task }) => {
          writeRstestTestMapping(manifest.resultDir, task.id, workflow.testId);
          const result = await runWorkflow(workflow, {
            resolveNode: project.nodes.require.bind(project.nodes),
            beforeEach: document.lifecycle.beforeEach,
            afterEach: document.lifecycle.afterEach,
            context: runtime.context,
            onResult: (value) =>
              writeWorkflowRunResult(manifest.resultDir, value),
          });
          if (result.status === 'failed') {
            throw new WorkflowExecutionError(result);
          }
        },
        manifest.retry === undefined ? undefined : { retry: manifest.retry },
      );
    }

    afterAll(async () => {
      const result = await runtime.finish();
      writeWorkflowDocumentRunResult(manifest.resultDir, result);
      if (result.status === 'failed') {
        throw new WorkflowDocumentExecutionError(result);
      }
    });
  });
}
