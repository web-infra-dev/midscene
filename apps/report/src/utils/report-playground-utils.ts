import { type AgentFactory, PlaygroundSDK } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';

export type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension';

/**
 * Gets a PlaygroundSDK instance based on service mode.
 * For report components that support both Server and In-Browser modes.
 *
 * @param serviceMode - The service mode: 'Server', 'In-Browser', or 'In-Browser-Extension'
 * @param agent - Optional initial agent (required if agentFactory not provided)
 * @param agentFactory - Optional factory function to create/recreate agent
 * @returns Configured PlaygroundSDK instance
 */
export function getReportPlaygroundSDK(
  serviceMode: ServiceModeType,
  agent?: any,
  agentFactory?: AgentFactory,
): PlaygroundSDK {
  if (serviceMode === 'Server') {
    return new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl: `http://localhost:${PLAYGROUND_SERVER_PORT}`,
    });
  }
  // For In-Browser and In-Browser-Extension modes, use local execution
  if (!agent && !agentFactory) {
    throw new Error(
      'Agent or agentFactory is required for local execution mode',
    );
  }
  return new PlaygroundSDK({
    type: 'local-execution',
    agentFactory,
  });
}
