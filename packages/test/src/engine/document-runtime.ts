import { createDocumentRuntime as coreCreateDocumentRuntime } from '@midscene/core/internal/test-runner';
import type { CollectedWorkflowDocument } from '../parser/types';
import type {
  CreateDocumentRuntimeOptions,
  WorkflowDocumentRuntime,
} from './types';

export const createDocumentRuntime: <TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: CreateDocumentRuntimeOptions<TContext>,
) => WorkflowDocumentRuntime<TContext> = coreCreateDocumentRuntime;
