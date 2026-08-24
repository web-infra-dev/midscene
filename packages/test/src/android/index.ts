import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

type NodeContext<TContext> = NodeExecutionContext<unknown, TContext>;

/** Minimal Android Agent capability required by the preset Node. */
export interface AndroidRunnerAgent {
  /** Execute a command in the connected Android device shell. */
  runAdbShell?(
    command: string,
    options?: { timeout?: number },
  ): Promise<string>;
}

/** Dependencies used by the Android preset Nodes. */
export interface CreateAndroidNodesOptions<TContext> {
  /** Return the Android Agent associated with the current workflow. */
  getAgent(ctx: NodeContext<TContext>): Awaitable<AndroidRunnerAgent>;
}

/** Input schema for the Android runAdbShell Node. */
export const runAdbShellInputSchema = z
  .strictObject({
    prompt: z
      .string()
      .regex(/\S/)
      .optional()
      .describe('String shorthand for the ADB shell command.'),
    command: z
      .string()
      .regex(/\S/)
      .optional()
      .describe('The shell command, without an adb shell prefix.'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('ADB shell command timeout in milliseconds.'),
  })
  .superRefine((input, ctx) => {
    if ((input.prompt === undefined) === (input.command === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'exactly one of prompt and command is required',
      });
    }
  });

/** Validated input accepted by the Android runAdbShell Node. */
export type RunAdbShellNodeInput = z.infer<typeof runAdbShellInputSchema>;

/** Create the P0 Android preset Nodes for an injected Android Agent. */
export function createAndroidNodes<TContext>(
  options: CreateAndroidNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createAndroidNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError('createAndroidNodes() requires getAgent().');
  }

  return [
    defineNode<typeof runAdbShellInputSchema, { stdout: string }, TContext>({
      name: 'runAdbShell',
      title: 'Run an ADB shell command',
      description:
        'Execute a shell command through the current Android Agent. Pass only the shell command, without the adb shell prefix.',
      inputSchema: runAdbShellInputSchema,
      async execute(ctx) {
        if (ctx.signal.aborted) {
          throw ctx.signal.reason ?? new Error('runAdbShell aborted.');
        }
        const command = ctx.input.command ?? ctx.input.prompt!;
        if (/^\s*adb(?:\s|$)/i.test(command)) {
          throw new NodeExecutionError(
            'runAdbShell',
            new TypeError(
              'command must not include an adb or adb shell prefix.',
            ),
          );
        }
        const agent = await options.getAgent(ctx);
        if (typeof agent?.runAdbShell !== 'function') {
          throw new NodeExecutionError(
            'runAdbShell',
            new TypeError(
              'getAgent() must return an Android Agent with runAdbShell().',
            ),
          );
        }
        const stdout = await agent.runAdbShell(command, {
          ...(ctx.input.timeoutMs === undefined
            ? {}
            : { timeout: ctx.input.timeoutMs }),
        });
        if (typeof stdout !== 'string') {
          throw new NodeExecutionError(
            'runAdbShell',
            new TypeError('runAdbShell() must return stdout as a string.'),
          );
        }
        return {
          summary: `Executed ADB shell command (${stdout.length} stdout characters)`,
          data: { stdout },
        };
      },
    }),
  ];
}
