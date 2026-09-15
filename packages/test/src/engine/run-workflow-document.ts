import { runWorkflowDocument as coreRunWorkflowDocument } from '@midscene/core/internal/test-runner';
import type { CollectedWorkflowDocument } from '../parser/types';
import type {
  RunWorkflowDocumentOptions,
  WorkflowDocumentExecutionResult,
} from './types';

export const runWorkflowDocument: <TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: RunWorkflowDocumentOptions<TContext>,
) => Promise<WorkflowDocumentExecutionResult> = coreRunWorkflowDocument;
