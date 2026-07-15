import { z } from 'zod/v4';
import { NodeDefinitionError } from '../errors';
import type {
  DefineNodeOptions,
  DefineNodeWithSchemaOptions,
  NodeDefinition,
  NodeDefinitionWithSchema,
  NodeInputSchema,
} from './types';

const validateOptionalText = (
  value: unknown,
  field: 'title' | 'description',
  node: string,
): void => {
  if (
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length === 0)
  ) {
    throw new NodeDefinitionError(
      `Node "${node}" ${field} must be a non-empty string.`,
      { node, field },
    );
  }
};

const validateInputSchema = (schema: unknown, node: string): void => {
  if (schema === undefined) return;
  if (!(schema instanceof z.ZodObject)) {
    throw new NodeDefinitionError(
      `Node "${node}" inputSchema must be a Zod object schema.`,
      { node, field: 'inputSchema' },
    );
  }
  if ('$' in schema.shape) {
    throw new NodeDefinitionError(
      `Node "${node}" inputSchema must not declare "$" as an input property.`,
      { node, field: 'inputSchema.$' },
    );
  }
};

const validateDefinition = (options: {
  name: string;
  title?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  execute: unknown;
}): void => {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError('Node definition must be an object.');
  }

  if (typeof options.name !== 'string' || options.name.trim().length === 0) {
    throw new NodeDefinitionError('Node name must be a non-empty string.');
  }

  validateOptionalText(options.title, 'title', options.name);
  validateOptionalText(options.description, 'description', options.name);
  validateInputSchema(options.inputSchema, options.name);

  if (typeof options.execute !== 'function') {
    throw new NodeDefinitionError(
      `Node "${options.name}" must provide an execute function.`,
      { node: options.name },
    );
  }
};

export function defineNode<
  TSchema extends NodeInputSchema,
  TData = unknown,
  TContext = unknown,
>(
  options: DefineNodeWithSchemaOptions<TSchema, TData, TContext>,
): NodeDefinitionWithSchema<TSchema, TData, TContext>;

export function defineNode<
  TInput = unknown,
  TData = unknown,
  TContext = unknown,
>(
  options: DefineNodeOptions<TInput, TData, TContext>,
): NodeDefinition<TInput, TData, TContext>;

export function defineNode(
  options: DefineNodeOptions<any, any, any>,
): NodeDefinition<any, any, any> {
  validateDefinition(options);
  return options;
}
