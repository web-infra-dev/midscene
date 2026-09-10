import type { AndroidAgent } from '@midscene/android';
import {
  androidAgentTestRunnerNodeDefinitions,
  launchInputSchema,
  runAdbShellInputSchema,
  runAdbShellOptionsInputSchema,
  terminateInputSchema,
} from '@midscene/android/test';
export type {
  LaunchNodeInput,
  RunAdbShellNodeInput,
  TerminateNodeInput,
} from '@midscene/android/test';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { createAgentTestRunnerNodes } from '../midscene';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export {
  launchInputSchema,
  runAdbShellInputSchema,
  runAdbShellOptionsInputSchema,
  terminateInputSchema,
};

export type AndroidRunnerAgent = Pick<
  AndroidAgent,
  'launch' | 'terminate' | 'runAdbShell' | 'back' | 'home' | 'recentApps'
>;

export interface CreateAndroidNodesOptions<TContext> {
  getAgent(
    execution: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<AndroidRunnerAgent>;
}

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

  return createAgentTestRunnerNodes(
    androidAgentTestRunnerNodeDefinitions,
    options.getAgent,
  );
}
