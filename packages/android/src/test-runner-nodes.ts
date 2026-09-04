import {
  type AgentTestRunnerNodeDefinition,
  createAgentTestRunnerNodeDefinition,
} from '@midscene/core/agent/test-runner';
import { z } from 'zod/v4';
import type { AndroidAgent } from './agent';

type AndroidAgentTestRunnerApi = Pick<
  AndroidAgent,
  'launch' | 'terminate' | 'runAdbShell' | 'back' | 'home' | 'recentApps'
>;

const defineAndroidAgentNode =
  createAgentTestRunnerNodeDefinition<AndroidAgentTestRunnerApi>(
    'an Android Agent',
  );

const nonBlankText = (description: string) =>
  z
    .string()
    .regex(/\S/, 'value must contain a non-whitespace character')
    .describe(description);

export const launchInputSchema = z.strictObject({
  uri: nonBlankText('The app, URL, URI, or package name to launch.'),
});

export const terminateInputSchema = z.strictObject({
  uri: nonBlankText('The package name or app name to terminate.'),
});

export const runAdbShellOptionsInputSchema = z.strictObject({
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('ADB shell command timeout in milliseconds.'),
});

export const runAdbShellInputSchema = z.strictObject({
  command: nonBlankText(
    'The shell command to execute, without an adb shell prefix.',
  ),
  options: runAdbShellOptionsInputSchema.optional(),
});

const emptyInputSchema = z.strictObject({});

export type LaunchNodeInput = z.infer<typeof launchInputSchema>;
export type TerminateNodeInput = z.infer<typeof terminateInputSchema>;
export type RunAdbShellNodeInput = z.infer<typeof runAdbShellInputSchema>;

const launchNode = defineAndroidAgentNode({
  method: 'launch',
  description: 'Launch an application through the current Android Agent.',
  stringInputKey: 'uri',
  inputSchema: launchInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Launched ${input.uri}` }),
});

const terminateNode = defineAndroidAgentNode({
  method: 'terminate',
  description: 'Terminate an application through the current Android Agent.',
  stringInputKey: 'uri',
  inputSchema: terminateInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Terminated ${input.uri}` }),
});

const runAdbShellNode = defineAndroidAgentNode({
  method: 'runAdbShell',
  title: 'Run an ADB shell command',
  description:
    'Execute a shell command through the current Android Agent. Pass only the shell command, without the adb shell prefix.',
  stringInputKey: 'command',
  inputSchema: runAdbShellInputSchema,
  toArgs(input, context) {
    context.signal.throwIfAborted();
    if (/^\s*adb(?:\s|$)/i.test(input.command)) {
      throw new TypeError(
        'command must not include an adb or adb shell prefix.',
      );
    }
    return [input.command, input.options];
  },
  toResult(stdout) {
    if (typeof stdout !== 'string') {
      throw new TypeError('runAdbShell() must return stdout as a string.');
    }
    return {
      summary: `Executed ADB shell command (${stdout.length} stdout characters)`,
      data: { stdout },
    };
  },
});

const backNode = defineAndroidAgentNode({
  method: 'back',
  description: 'Trigger the Android system back operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Android back' }),
});

const homeNode = defineAndroidAgentNode({
  method: 'home',
  description: 'Trigger the Android system home operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Android home' }),
});

const recentAppsNode = defineAndroidAgentNode({
  method: 'recentApps',
  description: 'Trigger the Android system recent apps operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Android recentApps' }),
});

export const androidAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [
    launchNode,
    terminateNode,
    runAdbShellNode,
    backNode,
    homeNode,
    recentAppsNode,
  ];
