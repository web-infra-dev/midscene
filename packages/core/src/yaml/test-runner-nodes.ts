import { assert } from '@midscene/shared/utils';
import { z } from 'zod/v4';
import {
  type AgentTestRunnerNodeDefinition,
  aiScrollInputSchema,
  aiTapInputSchema,
  commonAgentTestRunnerNodeDefinitions,
} from '../agent/test-runner-nodes';
import type { NodeResult } from '../test-runner/node/types';
import type { DeviceAction, MidsceneYamlFlowItem, UIContext } from '../types';
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

// These legacy fields are accepted only by YAML hosts, never native Node specs.
const legacyLocateFields = { uiContext: z.custom<UIContext>().optional() };
const legacyInputSchemas = new Map<string, z.ZodObject>([
  [
    'aiTap',
    aiTapInputSchema.extend({
      options: aiTapInputSchema.shape.options
        .unwrap()
        .extend(legacyLocateFields)
        .optional(),
    }),
  ],
  [
    'aiScroll',
    aiScrollInputSchema.extend({
      options: aiScrollInputSchema.shape.options
        .unwrap()
        .extend(legacyLocateFields)
        .optional(),
    }),
  ],
]);
export const legacyAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [
    ...commonAgentTestRunnerNodeDefinitions.map((definition) => ({
      ...definition,
      inputSchema:
        legacyInputSchemas.get(definition.name) ?? definition.inputSchema,
    })),
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
