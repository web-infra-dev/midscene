import type { PlaygroundSDK } from '@midscene/playground';

export type PlaygroundAiConfig = Record<string, string>;

export function hasPlaygroundAiConfig(config: PlaygroundAiConfig): boolean {
  return Object.keys(config).length > 0;
}

export async function applyPlaygroundAiConfig(
  playgroundSDK: Pick<PlaygroundSDK, 'overrideConfig'>,
  config: PlaygroundAiConfig,
): Promise<boolean> {
  if (!hasPlaygroundAiConfig(config)) {
    return false;
  }

  await playgroundSDK.overrideConfig(config);
  return true;
}
