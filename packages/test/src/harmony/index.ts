import type { HarmonyAgent } from '@midscene/harmony';
import {
  harmonyAgentTestRunnerNodeDefinitions,
  launchInputSchema,
  runHdcShellInputSchema,
  terminateInputSchema,
} from '@midscene/harmony/test-runner';
export type {
  LaunchNodeInput,
  RunHdcShellNodeInput,
  TerminateNodeInput,
} from '@midscene/harmony/test-runner';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { createAgentTestRunnerNodes } from '../midscene';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export { launchInputSchema, runHdcShellInputSchema, terminateInputSchema };

export type HarmonyRunnerAgent = Pick<
  HarmonyAgent,
  'launch' | 'terminate' | 'runHdcShell' | 'back' | 'home' | 'recentApps'
>;

export interface CreateHarmonyNodesOptions<TContext> {
  getAgent(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<HarmonyRunnerAgent>;
}

export function createHarmonyNodes<TContext>(
  options: CreateHarmonyNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createHarmonyNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError('createHarmonyNodes() requires getAgent().');
  }

  return createAgentTestRunnerNodes(
    harmonyAgentTestRunnerNodeDefinitions,
    options.getAgent,
  );
}
