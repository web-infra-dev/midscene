import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

const WDA_HTTP_METHODS = ['GET', 'POST', 'DELETE', 'PUT'] as const;
/** HTTP methods supported by the WebDriverAgent request Node. */
export type WDAHttpMethod = (typeof WDA_HTTP_METHODS)[number];

type NodeContext<TContext> = NodeExecutionContext<unknown, TContext>;

/** Minimal iOS Agent capability required by the preset Node. */
export interface IOSRunnerAgent {
  /** Execute one WebDriverAgent request through the iOS Agent action API. */
  runWdaRequest?(input: RunWdaRequestNodeInput): Promise<unknown>;
}

/** Dependencies used by the iOS preset Nodes. */
export interface CreateIOSNodesOptions<TContext> {
  /** Return the iOS Agent associated with the current workflow. */
  getAgent(ctx: NodeContext<TContext>): Awaitable<IOSRunnerAgent>;
}

/** Input schema for the iOS runWdaRequest Node. */
export const runWdaRequestInputSchema = z.strictObject({
  method: z.enum(WDA_HTTP_METHODS).describe('The WebDriverAgent HTTP method.'),
  endpoint: z
    .string()
    .regex(/^\/\S*$/, 'endpoint must start with / and contain no whitespace')
    .describe('The WebDriverAgent API endpoint.'),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('An optional JSON request body.'),
});

/** Validated input accepted by the iOS runWdaRequest Node. */
export type RunWdaRequestNodeInput = z.infer<typeof runWdaRequestInputSchema>;

/** Create the P0 iOS preset Nodes for an injected iOS Agent. */
export function createIOSNodes<TContext>(
  options: CreateIOSNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createIOSNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError('createIOSNodes() requires getAgent().');
  }

  return [
    defineNode<typeof runWdaRequestInputSchema, unknown, TContext>({
      name: 'runWdaRequest',
      title: 'Run a WebDriverAgent request',
      description:
        'Execute a WebDriverAgent HTTP request through the current iOS Agent and return its JSON-serializable response.',
      inputSchema: runWdaRequestInputSchema,
      async execute(ctx) {
        if (ctx.signal.aborted) {
          throw ctx.signal.reason ?? new Error('runWdaRequest aborted.');
        }
        const agent = await options.getAgent(ctx);
        if (typeof agent?.runWdaRequest !== 'function') {
          throw new NodeExecutionError(
            'runWdaRequest',
            new TypeError(
              'getAgent() must return an iOS Agent with runWdaRequest().',
            ),
          );
        }
        const response = await agent.runWdaRequest(ctx.input);
        return response === undefined
          ? {
              summary: `Executed WDA ${ctx.input.method} ${ctx.input.endpoint}`,
            }
          : {
              summary: `Executed WDA ${ctx.input.method} ${ctx.input.endpoint}`,
              data: response,
            };
      },
    }),
  ];
}
