import { assert } from '@midscene/shared/utils';
import { z } from 'zod/v4';
import {
  type AgentTestRunnerNodeDefinition,
  commonAgentTestRunnerNodeDefinitions,
} from '../agent/test-runner-nodes';
import type { NodeResult } from '../test-runner/node/types';
import type { DeviceAction, MidsceneYamlFlowItem } from '../types';
import { compileLegacyFlowItem } from './test-runner-compat';

/** Planning-only marker accepted by the old YAML grammar, not a native Test Node. */
const legacyFinalizeNodeDefinition: AgentTestRunnerNodeDefinition = {
  name: 'Finalize',
  inputSchema: z.strictObject({}),
  execute: () => undefined,
};

const legacyRunAdbShellNodeDefinition: AgentTestRunnerNodeDefinition = {
  name: 'runAdbShell',
  inputSchema: z.strictObject({ command: z.string(), timeout: z.number() }),
  async execute(agent, input) {
    const androidAgent = agent as {
      runAdbShell?: (
        command: string,
        options: { timeout: number },
      ) => Promise<unknown>;
      callActionInActionSpace(
        name: string,
        params: Record<string, unknown>,
      ): Promise<unknown>;
    };
    const command = input.command as string;
    const timeout = input.timeout as number;
    const value = androidAgent.runAdbShell
      ? await androidAgent.runAdbShell(command, { timeout })
      : await androidAgent.callActionInActionSpace('RunAdbShell', {
          command,
          timeout,
        });
    return value === undefined ? undefined : { data: value };
  },
};

/** Only YAML hosts resolve shorthand; the shared Agent receives canonical params. */
const legacyActionNodeDefinition: AgentTestRunnerNodeDefinition = {
  name: 'legacyAction',
  inputSchema: z.strictObject({ flow: z.record(z.string(), z.unknown()) }),
  async execute(agent, input, context) {
    context.signal.throwIfAborted();
    const actionSpace = await (
      agent as {
        getActionSpace(): Promise<DeviceAction[]>;
      }
    ).getActionSpace();
    context.signal.throwIfAborted();
    const step = compileLegacyFlowItem(
      input.flow as MidsceneYamlFlowItem,
      actionSpace,
    );
    assert(
      step.node !== 'legacyAction',
      `unknown flowItem in yaml: ${JSON.stringify(input.flow)}`,
    );
    const definition = legacyAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === step.node,
    );
    assert(definition, `Unknown Agent Node: ${step.node}`);
    const parsed = await definition.inputSchema.parseAsync(step.input);
    context.signal.throwIfAborted();
    return definition.execute(agent, parsed, context);
  },
};

/** Preserve the old task failure phase without adding native parser controls. */
const legacyValidationErrorNodeDefinition: AgentTestRunnerNodeDefinition = {
  name: 'legacyValidationError',
  inputSchema: z.strictObject({ message: z.string() }),
  execute(_agent, input) {
    throw new Error(input.message as string);
  },
};

// The old player checked YAML grammar, then passed options through to Agent.
// Validate only the compiled envelope here: native field whitelists, positive
// wait durations and nonempty image arrays must not narrow the legacy grammar.
// compileLegacyFlowItem preserves the old checks at their task execution phase;
// Agent/ActionSpace remain responsible for validating the business parameters.
const legacyPromptInputSchema = z.strictObject({
  prompt: z.unknown(),
  options: z.record(z.string(), z.unknown()).optional(),
});
const legacyInputSchemas = new Map<string, z.ZodObject>([
  ...[
    'aiAct',
    'aiTap',
    'aiLocate',
    'aiQuery',
    'aiNumber',
    'aiString',
    'aiBoolean',
    'aiAsk',
    'aiWaitFor',
    'aiScroll',
  ].map((name): [string, z.ZodObject] => [name, legacyPromptInputSchema]),
  ['aiAssert', legacyPromptInputSchema.extend({ message: z.unknown() })],
  ['javascript', z.strictObject({ script: z.unknown() })],
  [
    'runGherkinScenario',
    z.strictObject({
      scenario: z.unknown(),
      options: z.record(z.string(), z.unknown()).optional(),
    }),
  ],
  ['sleep', z.strictObject({ ms: z.number().positive() })],
  ['action', z.strictObject({ name: z.string(), params: z.unknown() })],
  [
    'recordToReport',
    z.strictObject({
      title: z.unknown(),
      options: z.record(z.string(), z.unknown()).optional(),
    }),
  ],
]);
const sharedDefinitions = new Map(
  commonAgentTestRunnerNodeDefinitions.map((definition) => [
    definition.name,
    definition,
  ]),
);
export const legacyAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [
    ...Array.from(legacyInputSchemas, ([name, inputSchema]) => {
      const definition = sharedDefinitions.get(name);
      assert(definition, `Missing shared Agent Node for legacy YAML: ${name}`);
      return { ...definition, inputSchema };
    }),
    legacyFinalizeNodeDefinition,
    legacyRunAdbShellNodeDefinition,
    legacyActionNodeDefinition,
    legacyValidationErrorNodeDefinition,
  ];

const insightNodes = new Set(['aiBoolean', 'aiNumber', 'aiString', 'aiAsk']);

/** Keep Test's { value } contract; only the legacy output view unwraps insights. */
export function getLegacyYamlResultData(
  node: string,
  output: NodeResult,
): unknown {
  return insightNodes.has(node)
    ? (output.data as { value: unknown }).value
    : output.data;
}
