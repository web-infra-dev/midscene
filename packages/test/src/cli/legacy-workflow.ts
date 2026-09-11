import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  MidsceneYamlScript,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import {
  WorkflowExecutionFailure,
  type WorkflowExecutionRecord,
  WorkflowPublicationError,
  executionRecordToResult,
  getResourceCleanupCompletion,
  runDocumentAttempts,
  serializeWorkflowExecutionRecord,
} from '@midscene/core/internal/test-runner';
import { collectLegacyYamlDocument } from '@midscene/core/internal/yaml-runtime';
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { JSON_SCHEMA, load } from 'js-yaml';
import merge from 'lodash.merge';
import type { WorkflowDocumentRunResult } from '../engine/types';
import { WorkflowParseError } from '../errors';
import { createCaseId, createWorkflowDocumentId } from '../parser/collect';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentSource,
} from '../parser/types';
import {
  type CreateYamlPlayerOptions,
  createYamlPlayer,
} from '../runtime/create-yaml-player';
import type { ResolvedExecutionProject } from './test-project';

export interface LegacyWorkflow {
  source: WorkflowDocumentSource;
  script: MidsceneYamlScript;
  sourceConfig: MidsceneYamlScript;
  document: CollectedWorkflowDocument;
}

// Coordinate only borrowed runtime resources. Generated report names are
// already unique; explicit output-path collisions remain a configuration
// concern, as they were in the old CLI.
type LegacyInvocationResource = string | object;
const queueKey = Symbol.for('@midscene/test/legacy-invocations/v2');
const queueHost = globalThis as typeof globalThis & {
  [queueKey]?: Map<LegacyInvocationResource, Promise<void>>;
};
queueHost[queueKey] ??= new Map();
const pendingInvocations = queueHost[queueKey];

/** @internal Release after report preservation, and after any deferred cleanup. */
export async function acquireLegacyInvocation(
  signal: AbortSignal,
  resources: readonly LegacyInvocationResource[],
) {
  signal.throwIfAborted();
  const keys = [...new Set(resources)];
  const previous = Promise.all([
    ...new Set(keys.map((key) => pendingInvocations.get(key))),
  ]);
  let release!: () => void;
  const completion = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queuedCompletion = previous.then(() => completion);
  for (const key of keys) pendingInvocations.set(key, queuedCompletion);
  void queuedCompletion.then(() => {
    for (const key of keys)
      if (pendingInvocations.get(key) === queuedCompletion)
        pendingInvocations.delete(key);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      void previous.then(() => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(signal.reason);
        else resolve();
      });
    });
  } catch (error) {
    release();
    throw error;
  }
  return (owner?: object) => {
    const cleanupCompletion = owner
      ? getResourceCleanupCompletion(owner)
      : undefined;
    if (cleanupCompletion) void cleanupCompletion.then(release, release);
    else release();
  };
}

function invocationResources(
  playerOptions?: CreateYamlPlayerOptions,
): LegacyInvocationResource[] {
  return [playerOptions?.agent, playerOptions?.page].filter(
    (resource): resource is object =>
      typeof resource === 'object' && resource !== null,
  );
}

const probeYaml = (content: string) =>
  load(content.replace(/\$\{[^}\r\n]*\}/g, 'MIDSCENE_ENV'), {
    schema: JSON_SCHEMA,
  });

export function isLegacyWorkflowFile(path: string): boolean {
  try {
    const value = probeYaml(readFileSync(path, 'utf8'));
    return (
      !!value && typeof value === 'object' && Object.hasOwn(value, 'tasks')
    );
  } catch {
    // Format detection does not own parse failures; collection records them.
    return false;
  }
}

/** Format selection only; old files retain their own parser and env rules. */
export async function collectLegacyWorkflow(
  source: WorkflowDocumentSource,
  cwd = process.cwd(),
  globalConfig?: MidsceneYamlTargetConfig,
): Promise<LegacyWorkflow | undefined> {
  const content = readFileSync(source.absolutePath, 'utf8');
  // Probe only the document shape. Legacy interpolation precedes YAML parsing,
  // so an unquoted ${ENV} inside a flow mapping is valid legacy input even
  // though the original text cannot yet be parsed as YAML.
  const value = probeYaml(content);
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'tasks'))
    return undefined;
  if (
    ['cases', 'beforeAll', 'beforeEach', 'afterEach', 'afterAll'].some((key) =>
      Object.hasOwn(value, key),
    )
  )
    throw new WorkflowParseError(
      'A workflow file cannot mix legacy tasks with native cases or lifecycle hooks.',
      { sourcePath: source.sourcePath },
    );
  // Match the old CLI: load cwd/.env before interpolating config and tasks,
  // without overriding shell values. Native Test configuration owns its own env.
  const { loadDotenvConfig } = await import('../runtime/dotenv-loader');
  loadDotenvConfig({ cwd });
  const sourceConfig = parseYamlScript(content, source.absolutePath);
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

export async function runLegacyWorkflow(
  workflow: LegacyWorkflow,
  options: {
    project: ResolvedExecutionProject;
    runDir: string;
    signal: AbortSignal;
    defaultTimeoutMs?: number;
    playerOptions?: CreateYamlPlayerOptions;
    beforeAttempt?(
      attemptIndex: number,
    ): Promise<CreateYamlPlayerOptions | undefined>;
    onDocumentResult?(document: WorkflowDocumentRunResult): Promise<void>;
    shouldStop(): boolean;
    onProgress(message: string): void;
  },
) {
  // This subpath has no CLI/Rstest startup side effects. Do not import its scheduler.
  const records: WorkflowExecutionRecord[] = [];
  const artifacts: Array<{
    runId: string;
    outputPath?: string;
    reportPath?: string;
    executionRecordPath?: string;
  }> = [];
  const result = () => {
    if (!records.length) return undefined;
    const executions = records.map(executionRecordToResult);
    return {
      records: [...records],
      artifacts: [...artifacts],
      cases: executions.flatMap(({ document, cases }) =>
        cases.map((outcome) => ({
          ...outcome,
          documentId: document.documentId,
          documentRunId: document.documentRunId,
        })),
      ),
      documents: executions.map((execution) => execution.document),
    };
  };
  try {
    await runDocumentAttempts(
      {
        retry: options.project.retry,
        signal: options.signal,
        shouldStop: options.shouldStop,
      },
      async (attemptIndex) => {
        options.onProgress(
          `    legacy file attempt ${attemptIndex + 1}/${options.project.retry + 1}: ${workflow.source.sourcePath}`,
        );
        const playerOptions = options.beforeAttempt
          ? await options.beforeAttempt(attemptIndex)
          : options.playerOptions;
        const player = await createYamlPlayer(
          workflow.source.absolutePath,
          workflow.script,
          playerOptions,
        );
        const release = await acquireLegacyInvocation(
          options.signal,
          invocationResources(playerOptions),
        );
        try {
          // Cancellation/bail may occur while a conflicting Project owns the paths.
          if (options.signal.aborted || options.shouldStop()) return;
          const invocationErrors: unknown[] = [];
          try {
            await player.run({
              signal: options.signal,
              defaultTimeoutMs: options.defaultTimeoutMs,
              attemptIndex,
              document: workflow.document,
              project: options.project,
            });
          } catch (error) {
            // Keep completed facts, but never repeat actions after an invocation
            // rejects (for example because cleanup or report publication failed).
            if (!player.executionRecord) throw error;
            invocationErrors.push(error);
          }
          const original = player.executionRecord;
          if (!original)
            throw new Error(
              `Legacy workflow did not produce an execution record: ${workflow.source.sourcePath}`,
            );
          let record: WorkflowExecutionRecord = {
            ...original,
            reportPaths: player.reportFile ? [player.reportFile] : [],
          };
          // Retain completed facts before any fallible artifact operation, including
          // previous file attempts. Publication failures must never become not-run.
          const recordIndex = records.push(record) - 1;
          const publicationErrors: WorkflowPublicationError[] = [];
          records[recordIndex] = record;
          try {
            // Publish each file attempt before deciding whether to retry it.
            // Deferring the owner callback until all attempts finish could replay
            // actions before noticing that the first attempt's output was lost.
            await options.onDocumentResult?.(result()!.documents.at(-1)!);
          } catch (error) {
            invocationErrors.push(error);
            record = {
              ...record,
              status: 'failed',
              observerErrors: [...(record.observerErrors ?? []), error],
            };
            records[recordIndex] = record;
          }
          const recordDir = join(
            options.runDir,
            options.project.projectId,
            'execution-records',
          );
          const recordPath = join(recordDir, `${record.runId}.json`);
          artifacts.push({
            runId: record.runId,
            outputPath: player.output ?? undefined,
            reportPath: record.reportPaths?.[0],
            executionRecordPath: recordPath,
          });
          try {
            await mkdir(recordDir, { recursive: true });
            await writeFile(
              recordPath,
              serializeWorkflowExecutionRecord(record),
            );
          } catch (error) {
            publicationErrors.push(
              new WorkflowPublicationError('write-result', recordPath, error),
            );
            records[recordIndex] = {
              ...record,
              status: 'failed',
              publicationErrors: [...publicationErrors],
            };
          }
          const infrastructureErrors = [
            ...invocationErrors,
            ...publicationErrors,
          ];
          if (infrastructureErrors.length)
            throw new WorkflowExecutionFailure(result()!, infrastructureErrors);
          return record.status;
        } finally {
          release(player);
        }
      },
    );
  } catch (error) {
    if (error instanceof WorkflowExecutionFailure) throw error;
    const partial = result();
    if (partial) throw new WorkflowExecutionFailure(partial, [error]);
    throw error;
  }
  return result();
}

export type LegacyWorkflowExecutionResult = NonNullable<
  Awaited<ReturnType<typeof runLegacyWorkflow>>
>;
