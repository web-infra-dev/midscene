import { uuid } from '@midscene/shared/utils';

/**
 * Internal context that ties model calls to the user-facing AI operation that
 * initiated them. It is intentionally carried explicitly instead of being
 * stored on Agent or TaskExecutor instances, which may run concurrently.
 */
export interface ModelInteractionContext {
  interactionId: string;
}

export function createModelInteractionContext(options?: {
  fallback?: boolean;
}): ModelInteractionContext {
  const id = uuid();
  return {
    interactionId: options?.fallback ? `fallback-${id}` : id,
  };
}
