import {
  type AgentTestRunnerNodeDefinition,
  createAgentTestRunnerNodeDefinition,
} from '@midscene/core/agent/test-runner';
import { z } from 'zod/v4';
import type { IOSAgent } from './agent';

type IOSAgentTestRunnerApi = Pick<
  IOSAgent,
  'launch' | 'terminate' | 'runWdaRequest' | 'home' | 'appSwitcher'
>;

const defineIOSAgentNode =
  createAgentTestRunnerNodeDefinition<IOSAgentTestRunnerApi>('an iOS Agent');

const nonBlankText = (description: string) =>
  z
    .string()
    .regex(/\S/, 'value must contain a non-whitespace character')
    .describe(description);

export const launchInputSchema = z.strictObject({
  uri: nonBlankText('The app, URL, URI, or bundle identifier to launch.'),
});

export const terminateInputSchema = z.strictObject({
  uri: nonBlankText('The bundle identifier or app name to terminate.'),
});

const WDA_HTTP_METHODS = ['GET', 'POST', 'DELETE', 'PUT'] as const;
export type WDAHttpMethod = (typeof WDA_HTTP_METHODS)[number];

export const wdaRequestInputSchema = z.strictObject({
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

export const runWdaRequestInputSchema = z.strictObject({
  request: wdaRequestInputSchema,
});

const emptyInputSchema = z.strictObject({});

export type LaunchNodeInput = z.infer<typeof launchInputSchema>;
export type TerminateNodeInput = z.infer<typeof terminateInputSchema>;
export type RunWdaRequestNodeInput = z.infer<typeof runWdaRequestInputSchema>;

const launchNode = defineIOSAgentNode({
  method: 'launch',
  description: 'Launch an application through the current iOS Agent.',
  stringInputKey: 'uri',
  inputSchema: launchInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Launched ${input.uri}` }),
});

const terminateNode = defineIOSAgentNode({
  method: 'terminate',
  description: 'Terminate an application through the current iOS Agent.',
  stringInputKey: 'uri',
  inputSchema: terminateInputSchema,
  toArgs: (input) => [input.uri],
  toResult: (_output, input) => ({ summary: `Terminated ${input.uri}` }),
});

const runWdaRequestNode = defineIOSAgentNode({
  method: 'runWdaRequest',
  title: 'Run a WebDriverAgent request',
  description:
    'Execute a WebDriverAgent HTTP request through the current iOS Agent and return its JSON-serializable response.',
  stringInputKey: false,
  inputSchema: runWdaRequestInputSchema,
  toArgs(input, context) {
    context.signal.throwIfAborted();
    return [input.request];
  },
  toResult(response, input) {
    const summary = `Executed WDA ${input.request.method} ${input.request.endpoint}`;
    return response === undefined ? { summary } : { summary, data: response };
  },
});

const homeNode = defineIOSAgentNode({
  method: 'home',
  description: 'Trigger the iOS system home operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered iOS home' }),
});

const appSwitcherNode = defineIOSAgentNode({
  method: 'appSwitcher',
  description: 'Trigger the iOS system app switcher operation.',
  stringInputKey: false,
  inputSchema: emptyInputSchema,
  toArgs: () => [],
  toResult: () => ({ summary: 'Triggered iOS appSwitcher' }),
});

export const iosAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [launchNode, terminateNode, runWdaRequestNode, homeNode, appSwitcherNode];
