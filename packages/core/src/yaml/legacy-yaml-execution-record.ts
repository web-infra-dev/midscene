import type { MidsceneYamlScript } from '@/types';
import type {
  CollectedWorkflowDocument,
  WorkflowDocumentExecutionResult,
  WorkflowExecutionRecord,
} from '../test-runner';

interface CreateLegacyYamlExecutionRecordOptions {
  runId: string;
  attemptIndex: number;
  projectName?: string;
  script: MidsceneYamlScript;
  document: CollectedWorkflowDocument;
  startedAt: Date;
  endedAt: Date;
  execution?: WorkflowDocumentExecutionResult;
  setupError?: unknown;
  executionError?: unknown;
  cleanupErrors: readonly unknown[];
  aborted: boolean;
  publicationErrors: readonly unknown[];
  outputs: Readonly<Record<string, unknown>>;
  reportFile?: string | null;
  children?: readonly WorkflowExecutionRecord[];
}

const yamlPlatform = (script: MidsceneYamlScript): string =>
  script.android
    ? 'android'
    : script.ios
      ? 'ios'
      : script.harmony
        ? 'harmony'
        : script.computer
          ? 'computer'
          : script.interface
            ? 'interface'
            : 'web';

/** Convert compatibility-host state into the shared immutable run record. */
export function createLegacyYamlExecutionRecord(
  options: CreateLegacyYamlExecutionRecordOptions,
): WorkflowExecutionRecord {
  const failed =
    options.setupError !== undefined ||
    options.executionError !== undefined ||
    options.cleanupErrors.length > 0 ||
    options.aborted ||
    options.execution?.document.status === 'failed' ||
    options.execution?.cases.some((outcome) => outcome.status !== 'success');
  return Object.freeze({
    runId: options.runId,
    attemptIndex: options.attemptIndex,
    sourcePath: options.document.sourcePath,
    projectName: options.projectName,
    platform: yamlPlatform(options.script),
    document: options.document,
    status: failed ? 'failed' : 'success',
    startedAt: options.startedAt.toISOString(),
    endedAt: options.endedAt.toISOString(),
    durationMs: Math.max(
      0,
      options.endedAt.getTime() - options.startedAt.getTime(),
    ),
    ...(options.execution ? { execution: options.execution } : {}),
    ...(options.setupError === undefined
      ? {}
      : { setupError: options.setupError }),
    ...(options.executionError === undefined
      ? {}
      : { executionError: options.executionError }),
    cleanupErrors: Object.freeze([...options.cleanupErrors]),
    ...(options.publicationErrors.length
      ? {
          publicationErrors: Object.freeze([...options.publicationErrors]),
        }
      : {}),
    outputs: Object.freeze({ ...options.outputs }),
    reportPaths: Object.freeze(options.reportFile ? [options.reportFile] : []),
    ...(options.children?.length
      ? { children: Object.freeze([...options.children]) }
      : {}),
  });
}
