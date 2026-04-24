import type { PlaygroundSDK } from '@midscene/playground';

export type PlaygroundAiConfig = Record<string, string>;

export function hasPlaygroundAiConfig(config: PlaygroundAiConfig): boolean {
  return Object.keys(config).length > 0;
}

export function serializePlaygroundAiConfig(
  config: PlaygroundAiConfig,
): string {
  return JSON.stringify(
    Object.entries(config).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
  );
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
