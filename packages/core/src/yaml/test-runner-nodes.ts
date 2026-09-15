import { z } from 'zod/v4';
import {
  type AgentTestRunnerNodeDefinition,
  aiScrollInputSchema,
  aiTapInputSchema,
  commonAgentTestRunnerNodeDefinitions,
} from '../agent/test-runner-nodes';
import type { NodeResult } from '../test-runner/node/types';
import type { UIContext } from '../types';

/** Planning-only marker accepted by the old YAML grammar, not a native Test Node. */
const legacyFinalizeNodeDefinition: AgentTestRunnerNodeDefinition = {
  name: 'Finalize',
  inputSchema: z.strictObject({}),
  execute: () => undefined,
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
