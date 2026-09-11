import { basename, join } from 'node:path';
import { commonAgentTestRunnerNodeDefinitions } from '@midscene/core/agent/test';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import { z } from 'zod/v4';
import type { DocumentSetupDefinition } from '../cli/test-project';
import { type MidsceneUIAgent, createAgentTestRunnerNodes } from '../midscene';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';
import {
  type YamlRuntimeContext,
  type YamlSetupOptions,
  createYamlDocumentSetup,
} from './yaml-setup';

const runAdbShellInputSchema = z.strictObject({
  command: z.string(),
  timeout: z.number(),
});

const runAdbShell = defineNode<
  typeof runAdbShellInputSchema,
  unknown,
  YamlRuntimeContext
>({
  name: 'runAdbShell',
  inputSchema: runAdbShellInputSchema,
  async execute(ctx) {
    const agent = ctx.context.agent as MidsceneUIAgent & {
      runAdbShell?: (
        command: string,
        options: { timeout: number },
      ) => Promise<unknown>;
      callActionInActionSpace(
        name: string,
        params: Record<string, unknown>,
      ): Promise<unknown>;
    };
    const value = agent.runAdbShell
      ? await agent.runAdbShell(ctx.input.command, {
          timeout: ctx.input.timeout,
        })
      : await agent.callActionInActionSpace('RunAdbShell', {
          command: ctx.input.command,
          timeout: ctx.input.timeout,
        });
    return value === undefined ? undefined : { data: value };
  },
});

export interface LegacyYamlDocumentHost {
  documentSetup: DocumentSetupDefinition<YamlRuntimeContext>;
  nodes: readonly NodeDefinition<any, any, YamlRuntimeContext>[];
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
 * tasks/flow into public Nodes before this host acquires any platform resource.
 */
export function createLegacyYamlDocumentHost(
  options: LegacyYamlDocumentHostOptions,
): LegacyYamlDocumentHost {
  const scriptName = basename(options.file).replace(/\.ya?ml$/i, '');
  return {
    documentSetup: createYamlDocumentSetup({
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
    }),
    nodes: [
      ...createAgentTestRunnerNodes<YamlRuntimeContext>(
        commonAgentTestRunnerNodeDefinitions,
        (ctx) => ctx.context.agent,
      ),
      runAdbShell,
    ],
  };
}
