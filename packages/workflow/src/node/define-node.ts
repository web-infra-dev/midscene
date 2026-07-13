import { NodeDefinitionError } from '../errors';
import type { DefineNodeOptions, NodeDefinition } from './types';

export function defineNode<TInput = unknown, TData = unknown>(
  options: DefineNodeOptions<TInput, TData>,
): NodeDefinition<TInput, TData> {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError('Node definition must be an object.');
  }

  if (typeof options.name !== 'string' || options.name.trim().length === 0) {
    throw new NodeDefinitionError('Node name must be a non-empty string.');
  }

  if (typeof options.execute !== 'function') {
    throw new NodeDefinitionError(
      `Node "${options.name}" must provide an execute function.`,
      { node: options.name },
    );
  }

  return options;
}
