import {
  type LaunchPlaygroundOptions,
  type LaunchPlaygroundResult,
  playgroundForAgent,
  playgroundForAgentFactory,
  playgroundForSessionManager,
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
  const applyPreparedPlatform = (result: LaunchPlaygroundResult) => {
    result.server.setPreparedPlatform(prepared);
    return result;
  };

  if (prepared.agentFactory) {
    return applyPreparedPlatform(
      await playgroundForAgentFactory(prepared.agentFactory).launch(
        launchOptions,
      ),
    );
  }

  if (prepared.agent) {
    return applyPreparedPlatform(
      await playgroundForAgent(prepared.agent).launch(launchOptions),
    );
  }

  if (prepared.sessionManager) {
    return applyPreparedPlatform(
      await playgroundForSessionManager().launch(launchOptions),
    );
  }

  throw new Error(
    `Prepared platform "${prepared.platformId}" must provide agent, agentFactory, or sessionManager`,
  );
}
