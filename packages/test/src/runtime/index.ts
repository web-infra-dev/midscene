import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Agent } from '@midscene/core/agent';
import {
  type DocumentSetupDefinition,
  type ProjectSetupDefinition,
  type WorkflowDocumentRunResult,
  WorkflowPublicationError,
} from '@midscene/core/internal/test-runner';
import {
  enterYamlAction,
  runInYamlExecutionContext,
} from '@midscene/core/internal/yaml-runtime';
import { resolveYamlOutputConfig } from '@midscene/core/yaml';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  type CreateYamlPlayerOptions,
  type YamlAgentConfig,
  createYamlAgent,
} from './create-yaml-player';

export {
  createYamlAgent,
  createYamlPlayer,
  launchServer,
  type YamlAgentConfig,
  type CreateYamlPlayerOptions,
  type SingleYamlExecutionResult,
  type YamlStaticServer,
} from './create-yaml-player';
export { loadDotenvConfig, type DotenvLoadOptions } from './dotenv-loader';
export {
  createLegacyConfigFactory,
  matchLegacyYamlFiles,
  defaultLegacyConfig,
  pickLegacyYamlTargetConfig,
  type LegacyTestRunPlan,
  type LegacyYamlBatchConfig,
  type LegacyConfigFactoryOptions,
  type LegacyParsedConfig,
  type LegacyYamlFileMatcher,
} from './legacy-config';
export { parseLegacyArguments } from './legacy-arguments';
export {
  buildLegacySummaryData,
  getLegacyExecutionSummary,
  type LegacyExecutionSummary,
} from './legacy-summary-format';
export {
  assertBrowserContextUsage,
  createYamlBatchBrowser,
  type YamlBatchBrowserInput,
  type YamlBatchBrowserSession,
} from './legacy-browser';

export interface YamlRuntimeContext {
  agent: Agent;
}

export interface YamlSetupOptions {
  name?: string;
  file: string;
  script: YamlAgentConfig;
  options?: CreateYamlPlayerOptions;
  /** Optional setup script, executed whenever this scope acquires its Agent. */
  setup?: string;
}

/** Explicitly share one Agent across the Project, including file retries. */
export function createYamlProjectSetup(
  options: YamlSetupOptions,
): ProjectSetupDefinition<YamlRuntimeContext> {
  return createYamlSetup(options);
}

/** Match standalone YAML ownership: a fresh Agent for each document attempt. */
export function createYamlDocumentSetup(
  options: YamlSetupOptions,
): DocumentSetupDefinition<YamlRuntimeContext> {
  return createYamlSetup(options);
}

function createYamlSetup(options: YamlSetupOptions) {
  const outputConfig = resolveYamlOutputConfig(options.script);
  return {
    name: options.name ?? 'yaml-runtime',
    async setup(ctx: {
      signal: AbortSignal;
      onTeardown(teardown: () => Promise<void>): void;
    }) {
      const { agent, freeFn } = await createYamlAgent(
        options.file,
        options.script,
        options.options,
      );
      ctx.onTeardown(async () => {
        const errors: unknown[] = [];
        for (const cleanup of [...freeFn].reverse()) {
          try {
            await cleanup.fn();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length)
          throw new AggregateError(errors, 'YAML runtime teardown failed');
      });
      ctx.signal.throwIfAborted();
      if (options.setup)
        await runInYamlExecutionContext(async () => {
          const leave = enterYamlAction(agent, ctx.signal);
          try {
            await agent.runYaml(options.setup!);
          } finally {
            leave();
          }
        });
      return { agent };
    },
    async onDocumentResult(
      document: WorkflowDocumentRunResult,
      context: YamlRuntimeContext | undefined,
    ) {
      // The engine collects named data; target-local file paths and the legacy
      // log filename remain an output convention of this resource owner.
      const write = async (path: string, value: unknown) => {
        try {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, JSON.stringify(value, null, 2));
        } catch (error) {
          throw new WorkflowPublicationError('write-result', path, error);
        }
      };
      if (outputConfig.output)
        await write(outputConfig.output, document.outputs ?? {});
      if (outputConfig.unstableLogContent && context) {
        const path =
          typeof outputConfig.unstableLogContent === 'string'
            ? outputConfig.unstableLogContent
            : join(getMidsceneRunSubDir('output'), 'unstableLogContent.json');
        await write(path, context.agent._unstableLogContent());
      }
    },
  };
}
