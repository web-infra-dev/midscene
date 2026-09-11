import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Agent } from '@midscene/core/agent';
import type {
  DocumentSetupContext,
  DocumentSetupDefinition,
  NodeScopeTeardownResult,
  ProjectSetupDefinition,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import { WorkflowPublicationError } from '@midscene/core/internal/test-runner';
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

export interface YamlRuntimeContext {
  agent: Agent;
  /** Resolved output owned by this runtime scope, when configured. */
  outputPath?: string;
}

export interface YamlSetupOptions {
  name?: string;
  file: string;
  script: YamlAgentConfig;
  options?:
    | CreateYamlPlayerOptions
    | ((
        context: DocumentSetupContext<unknown>,
      ) =>
        | CreateYamlPlayerOptions
        | undefined
        | Promise<CreateYamlPlayerOptions | undefined>);
  /** Optional setup script, executed whenever this scope acquires its Agent. */
  setup?: string;
  /** Supplies the Test-native output path when the YAML target omits one. */
  defaultOutputPath?: (
    context: DocumentSetupContext<unknown>,
  ) => string | undefined;
  onDocumentResult?(
    document: WorkflowDocumentRunResult,
    context: YamlRuntimeContext,
  ): void | Promise<void>;
}

/** Explicitly share one Agent across the Project, including file retries. */
export function createYamlProjectSetup(
  options: YamlSetupOptions,
): ProjectSetupDefinition<YamlRuntimeContext> {
  if (typeof options.options === 'function') {
    throw new TypeError(
      'createYamlProjectSetup() requires static options; per-attempt options belong to createYamlDocumentSetup().',
    );
  }
  const staticOptions = options.options;
  const outputConfig = resolveYamlOutputConfig(options.script);
  return {
    name: options.name ?? 'yaml-runtime',
    async setup(ctx) {
      const { agent, freeFn } = await createYamlAgent(
        options.file,
        options.script,
        staticOptions,
      );
      agent._prepareForTestRunner?.();
      ctx.onTeardown(async () => {
        await releaseYamlAgent(freeFn);
      });
      await runYamlSetup(agent, options.setup, ctx.signal);
      const outputPath = outputConfig.output
        ? resolve(process.cwd(), outputConfig.output)
        : undefined;
      return { agent, ...(outputPath ? { outputPath } : {}) };
    },
    onDocumentResult: createYamlDocumentResultPublisher(options, outputConfig),
  };
}

/** Match standalone YAML ownership: a fresh Agent for each document attempt. */
export function createYamlDocumentSetup(
  options: YamlSetupOptions,
): DocumentSetupDefinition<YamlRuntimeContext> {
  const outputConfig = resolveYamlOutputConfig(options.script);
  return {
    name: options.name ?? 'yaml-runtime',
    async setup(ctx) {
      const resolvedOptions =
        typeof options.options === 'function'
          ? await options.options(ctx)
          : options.options;
      const { agent, freeFn } = await createYamlAgent(
        options.file,
        options.script,
        resolvedOptions,
      );
      agent._prepareForTestRunner?.();
      ctx.onTeardown(async () => {
        const reportPaths: string[] = [];
        const reportSources: NonNullable<
          NodeScopeTeardownResult['reportSources']
        >[number][] = [];
        const errors: unknown[] = [];
        try {
          const reportPath = await agent.flushReport?.();
          if (reportPath) reportPaths.push(reportPath);
          const source = await agent._createReportSource?.(
            ctx.document.documentRunId,
          );
          if (source) reportSources.push(source);
        } catch (error) {
          errors.push(error);
        }
        try {
          await releaseYamlAgent(freeFn);
        } catch (error) {
          errors.push(error);
        }
        if (errors.length) {
          throw yamlAggregateError('YAML runtime teardown failed', errors);
        }
        return {
          ...(reportPaths.length ? { reportPaths } : {}),
          ...(reportSources.length ? { reportSources } : {}),
        };
      });
      await runYamlSetup(agent, options.setup, ctx.signal);
      const outputPath = outputConfig.output
        ? resolve(process.cwd(), outputConfig.output)
        : options.defaultOutputPath
          ? options.defaultOutputPath(ctx)
          : undefined;
      return { agent, ...(outputPath ? { outputPath } : {}) };
    },
    onDocumentResult: createYamlDocumentResultPublisher(options, outputConfig),
  };
}

async function releaseYamlAgent(
  freeFn: Awaited<ReturnType<typeof createYamlAgent>>['freeFn'],
): Promise<void> {
  const errors: unknown[] = [];
  for (const cleanup of [...freeFn].reverse()) {
    try {
      await cleanup.fn();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw yamlAggregateError('YAML runtime cleanup failed', errors);
  }
}

function yamlAggregateError(label: string, errors: unknown[]): AggregateError {
  const messages = errors.map((error) =>
    error instanceof Error ? error.message : String(error),
  );
  return new AggregateError(errors, `${label}: ${messages.join('; ')}`);
}

async function runYamlSetup(
  agent: Agent,
  setup: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (!setup) return;
  await runInYamlExecutionContext(async () => {
    const leave = enterYamlAction(agent, signal);
    try {
      await agent.runYaml(setup);
    } finally {
      leave();
    }
  });
}

function createYamlDocumentResultPublisher(
  options: YamlSetupOptions,
  outputConfig: ReturnType<typeof resolveYamlOutputConfig>,
) {
  return async (
    document: WorkflowDocumentRunResult,
    context: YamlRuntimeContext | undefined,
  ): Promise<void> => {
    const write = async (path: string, value: unknown) => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(value, null, 2));
      } catch (error) {
        throw new WorkflowPublicationError('write-result', path, error);
      }
    };
    const outputPath = context?.outputPath ?? outputConfig.output;
    if (outputPath) await write(outputPath, document.outputs ?? {});
    if (outputConfig.unstableLogContent && context) {
      const path =
        typeof outputConfig.unstableLogContent === 'string'
          ? outputConfig.unstableLogContent
          : join(getMidsceneRunSubDir('output'), 'unstableLogContent.json');
      await write(path, context.agent._unstableLogContent());
    }
    if (context) await options.onDocumentResult?.(document, context);
  };
}
