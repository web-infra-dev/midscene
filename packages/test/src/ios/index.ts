import type { IOSAgent } from '@midscene/ios';
import {
  iosAgentTestRunnerNodeDefinitions,
  launchInputSchema,
  runWdaRequestInputSchema,
  terminateInputSchema,
  wdaRequestInputSchema,
} from '@midscene/ios/test-runner';
export type {
  LaunchNodeInput,
  RunWdaRequestNodeInput,
  TerminateNodeInput,
  WDAHttpMethod,
} from '@midscene/ios/test-runner';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { createAgentTestRunnerNodes } from '../midscene';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export {
  launchInputSchema,
  runWdaRequestInputSchema,
  terminateInputSchema,
  wdaRequestInputSchema,
};

export type IOSRunnerAgent = Pick<
  IOSAgent,
  'launch' | 'terminate' | 'runWdaRequest' | 'home' | 'appSwitcher'
>;

export interface CreateIOSNodesOptions<TContext> {
  getAgent(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<IOSRunnerAgent>;
}

export function createIOSNodes<TContext>(
  options: CreateIOSNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createIOSNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError('createIOSNodes() requires getAgent().');
  }

  return createAgentTestRunnerNodes(
    iosAgentTestRunnerNodeDefinitions,
    options.getAgent,
  );
}
