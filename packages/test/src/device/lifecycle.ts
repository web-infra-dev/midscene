import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

type NodeContext<TContext> = NodeExecutionContext<unknown, TContext>;
type AgentGetter<TContext> = (ctx: NodeContext<TContext>) => Awaitable<unknown>;
type LifecycleMethod = 'launch' | 'terminate';

/** Device capabilities required by Android and iOS lifecycle Nodes. */
export interface DeviceLifecycleAgent {
  launch(uri: string): Promise<void>;
  terminate(uri: string): Promise<void>;
}

const lifecycleInputSchema = (
  operation: LifecycleMethod,
  description: string,
) =>
  z
    .strictObject({
      prompt: z
        .string()
        .regex(/\S/, 'prompt must contain a non-whitespace character')
        .optional()
        .describe(`String shorthand for the app to ${operation}.`),
      uri: z
        .string()
        .regex(/\S/, 'uri must contain a non-whitespace character')
        .optional()
        .describe(description),
    })
    .superRefine((input, ctx) => {
      if ((input.prompt === undefined) === (input.uri === undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'exactly one of prompt and uri is required',
        });
      }
    });

/** Input schema for the device launch Node. */
export const launchInputSchema = lifecycleInputSchema(
  'launch',
  'The app, URL, URI, package name, or bundle identifier to launch.',
);

/** Input schema for the device terminate Node. */
export const terminateInputSchema = lifecycleInputSchema(
  'terminate',
  'The package name, bundle identifier, or app name to terminate.',
);

export type LaunchNodeInput = z.infer<typeof launchInputSchema>;
export type TerminateNodeInput = z.infer<typeof terminateInputSchema>;

const requireLifecycleMethod = (
  agent: unknown,
  method: LifecycleMethod,
  agentName: string,
): DeviceLifecycleAgent[LifecycleMethod] => {
  if (
    typeof agent !== 'object' ||
    agent === null ||
    typeof (agent as Record<LifecycleMethod, unknown>)[method] !== 'function'
  ) {
    throw new NodeExecutionError(
      method,
      new TypeError(`getAgent() must return ${agentName} with ${method}().`),
    );
  }
  return (agent as DeviceLifecycleAgent)[method];
};

export const createLaunchNode = <TContext>(
  getAgent: AgentGetter<TContext>,
  agentName = 'an Agent',
): NodeDefinition<any, any, TContext> =>
  defineNode<typeof launchInputSchema, unknown, TContext>({
    name: 'launch',
    description:
      'Launch an app, URL, or URI through the current Midscene Agent. This Node does not install or manage applications.',
    inputSchema: launchInputSchema,
    async execute(ctx) {
      const uri = ctx.input.uri ?? ctx.input.prompt!;
      const agent = await getAgent(ctx);
      const launch = requireLifecycleMethod(agent, 'launch', agentName);
      await launch.call(agent, uri);
      return { summary: `Launched ${uri}` };
    },
  });

const createTerminateNode = <TContext>(
  getAgent: AgentGetter<TContext>,
  agentName: string,
): NodeDefinition<any, any, TContext> =>
  defineNode<typeof terminateInputSchema, unknown, TContext>({
    name: 'terminate',
    description:
      'Terminate an application through the current Midscene Agent. This Node does not uninstall the application or clear its data.',
    inputSchema: terminateInputSchema,
    async execute(ctx) {
      const uri = ctx.input.uri ?? ctx.input.prompt!;
      const agent = await getAgent(ctx);
      const terminate = requireLifecycleMethod(agent, 'terminate', agentName);
      await terminate.call(agent, uri);
      return { summary: `Terminated ${uri}` };
    },
  });

export const createDeviceLifecycleNodes = <TContext>(
  getAgent: (ctx: NodeContext<TContext>) => Awaitable<DeviceLifecycleAgent>,
  agentName: string,
): readonly NodeDefinition<any, any, TContext>[] => [
  createLaunchNode(getAgent, agentName),
  createTerminateNode(getAgent, agentName),
];
