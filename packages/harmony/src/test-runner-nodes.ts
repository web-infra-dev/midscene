import {
  type AgentTestRunnerNodeDefinition,
  createAgentTestRunnerNodeDefinition,
} from '@midscene/core/agent/test-runner';
import { z } from 'zod/v4';
import type { HarmonyAgent } from './agent';

type HarmonyAgentTestRunnerApi = Pick<
  HarmonyAgent,
  'launch' | 'terminate' | 'runHdcShell' | 'back' | 'home' | 'recentApps'
>;

const defineHarmonyAgentNode =
  createAgentTestRunnerNodeDefinition<HarmonyAgentTestRunnerApi>(
    'a Harmony Agent',
  );

const nonBlankText = (description: string) =>
  z
    .string()
    .regex(/\S/, 'value must contain a non-whitespace character')
    .describe(description);

export const launchInputSchema = z.strictObject({
  uri: nonBlankText(
    'The app, URL, URI, bundle name, or bundle/Ability target to launch.',
  ),
});

export const terminateInputSchema = z.strictObject({
  uri: nonBlankText('The bundle name or app name to terminate.'),
});

export const runHdcShellInputSchema = z.strictObject({
  command: nonBlankText(
    'The shell command to execute, without an hdc shell prefix.',
  ),
});

const emptyInputSchema = z.strictObject({});

export type LaunchNodeInput = z.infer<typeof launchInputSchema>;
export type TerminateNodeInput = z.infer<typeof terminateInputSchema>;
export type RunHdcShellNodeInput = z.infer<typeof runHdcShellInputSchema>;

const launchNode = defineHarmonyAgentNode({
  method: 'launch',
  description: 'Launch an application through the current Harmony Agent.',
  stringInputKey: 'uri',
  inputSchema: launchInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Launched ${input.uri}` }),
});

const terminateNode = defineHarmonyAgentNode({
  method: 'terminate',
  description: 'Terminate an application through the current Harmony Agent.',
  stringInputKey: 'uri',
  inputSchema: terminateInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Terminated ${input.uri}` }),
});

const runHdcShellNode = defineHarmonyAgentNode({
  method: 'runHdcShell',
  title: 'Run an HDC shell command',
  description:
    'Execute a shell command through the current Harmony Agent. Pass only the shell command, without the hdc shell prefix.',
  stringInputKey: 'command',
  inputSchema: runHdcShellInputSchema,
  toArgs(input, context) {
    context.signal.throwIfAborted();
    if (/^\s*hdc(?:\s|$)/i.test(input.command)) {
      throw new TypeError(
        'command must not include an hdc or hdc shell prefix.',
      );
    }
    return [input.command];
  },
  toResult(stdout) {
    if (typeof stdout !== 'string') {
      throw new TypeError('runHdcShell() must return stdout as a string.');
    }
    return {
      summary: `Executed HDC shell command (${stdout.length} stdout characters)`,
      data: { stdout },
    };
  },
});

const backNode = defineHarmonyAgentNode({
  method: 'back',
  description: 'Trigger the Harmony system back operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Harmony back' }),
});

const homeNode = defineHarmonyAgentNode({
  method: 'home',
  description: 'Trigger the Harmony system home operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Harmony home' }),
});

const recentAppsNode = defineHarmonyAgentNode({
  method: 'recentApps',
  description: 'Trigger the Harmony system recent apps operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered Harmony recentApps' }),
});

export const harmonyAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [
    launchNode,
    terminateNode,
    runHdcShellNode,
    backNode,
    homeNode,
    recentAppsNode,
  ];
