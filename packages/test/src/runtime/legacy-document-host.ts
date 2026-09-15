import { basename, join } from 'node:path';
import type {
  DocumentSetupDefinition,
  StepResultHandler,
} from '@midscene/core/internal/test-runner';
import {
  getLegacyYamlResultData,
  legacyAgentTestRunnerNodeDefinitions,
} from '@midscene/core/internal/yaml-runtime';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import { createAgentTestRunnerNodes } from '../midscene';
import type { NodeDefinition } from '../node/types';
import {
  type YamlRuntimeContext,
  type YamlSetupOptions,
  createYamlDocumentSetup,
} from './yaml-setup';

export interface LegacyYamlDocumentHost {
  documentSetup: DocumentSetupDefinition<YamlRuntimeContext>;
  nodes: readonly NodeDefinition<any, any, YamlRuntimeContext>[];
  onStepResult: StepResultHandler;
}

export interface LegacyYamlDocumentArtifact {
  documentRunId: string;
  outputPath?: string;
  reportPath?: string;
}

export interface LegacyYamlDocumentHostOptions extends YamlSetupOptions {
  onArtifact?(artifact: LegacyYamlDocumentArtifact): void;
}

/**
 * Runtime-only half of legacy YAML support. The adapter has already compiled
 * tasks/flow into Steps before this host acquires any platform resource.
 */
export function createLegacyYamlDocumentHost(
  options: LegacyYamlDocumentHostOptions,
): LegacyYamlDocumentHost {
  const scriptName = basename(options.file).replace(/\.ya?ml$/i, '');
  let resultContext: YamlRuntimeContext | undefined;
  let unnamedResultIndex = 0;
  const documentSetup = createYamlDocumentSetup({
    ...options,
    defaultOutputPath:
      options.defaultOutputPath ??
      (() =>
        join(getMidsceneRunSubDir('output'), `${scriptName}-${uuid()}.json`)),
    onDocumentResult: async (document, context) => {
      await options.onDocumentResult?.(document, context);
      options.onArtifact?.({
        documentRunId: document.documentRunId,
        ...(context.outputPath ? { outputPath: context.outputPath } : {}),
        ...(document.reportPaths?.length
          ? { reportPath: document.reportPaths.at(-1) }
          : {}),
      });
    },
  });
  return {
    documentSetup: {
      ...documentSetup,
      async setup(ctx) {
        resultContext = undefined;
        unnamedResultIndex = 0;
        resultContext = await documentSetup.setup(ctx);
        return resultContext;
      },
    },
    onStepResult(_info, result) {
      if (
        result.meta.captureResult &&
        result.output &&
        Object.hasOwn(result.output, 'data') &&
        resultContext?.results
      ) {
        const key = result.meta.resultName || String(unnamedResultIndex++);
        resultContext.results[key] = getLegacyYamlResultData(
          result.node,
          result.output,
        );
      }
    },
    nodes: createAgentTestRunnerNodes<YamlRuntimeContext>(
      legacyAgentTestRunnerNodeDefinitions,
      (ctx) => ctx.context.agent,
    ),
  };
}
