import type { ModelProtocol } from '../types.js';

/** Accept old evaluation configs while emitting the current SDK protocol key. */
export function resolveModelProtocol(
  protocol?: string,
  apiType?: string,
): ModelProtocol {
  if (protocol !== undefined) {
    if (protocol === 'openai-chat' || protocol === 'openai-responses') {
      return protocol;
    }
    throw new Error('Model protocol must be openai-chat or openai-responses');
  }
  if (apiType === 'responses') return 'openai-responses';
  if (apiType === undefined || apiType === 'chat-completions') {
    return 'openai-chat';
  }
  throw new Error(
    'Legacy model API type must be responses or chat-completions',
  );
}
