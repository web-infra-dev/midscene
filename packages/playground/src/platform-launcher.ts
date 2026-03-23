import {
  type LaunchPlaygroundOptions,
  type LaunchPlaygroundResult,
  playgroundForAgent,
  playgroundForAgentFactory,
} from './launcher';
import {
  type PreparedPlaygroundPlatform,
  resolvePreparedLaunchOptions,
} from './platform';

export async function launchPreparedPlaygroundPlatform(
  prepared: PreparedPlaygroundPlatform,
  overrides: LaunchPlaygroundOptions = {},
): Promise<LaunchPlaygroundResult> {
  const launchOptions = resolvePreparedLaunchOptions(prepared, overrides);

  if (prepared.agentFactory) {
    return playgroundForAgentFactory(prepared.agentFactory).launch(
      launchOptions,
    );
  }

  if (prepared.agent) {
    return playgroundForAgent(prepared.agent).launch(launchOptions);
  }

  throw new Error(
    `Prepared platform "${prepared.platformId}" must provide either agent or agentFactory`,
  );
}
