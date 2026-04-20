import type { PlaygroundRuntimeInfo } from '@midscene/playground';
import type {
  PlaygroundBranding,
  UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import type { PlaygroundControllerState } from './types';

export function buildConversationConfig(
  state: Pick<
    PlaygroundControllerState,
    'deviceType' | 'executionUxHints' | 'countdownSeconds'
  >,
  playgroundConfig?: Partial<UniversalPlaygroundConfig>,
): UniversalPlaygroundConfig {
  return {
    showContextPreview: false,
    layout: 'vertical',
    showVersionInfo: true,
    enableScrollToBottom: true,
    serverMode: true,
    showEnvConfigReminder: true,
    deviceType: state.deviceType,
    executionUx: {
      hints: state.executionUxHints,
      countdownSeconds: state.countdownSeconds,
    },
    ...playgroundConfig,
  };
}

export function buildConversationBranding(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  title: string,
  appVersion: string,
  deviceType: string,
  branding?: Partial<PlaygroundBranding>,
): PlaygroundBranding {
  return {
    ...branding,
    title: runtimeInfo?.title ?? title,
    version: appVersion,
    targetName:
      runtimeInfo?.platformId ?? branding?.targetName ?? deviceType ?? 'screen',
  };
}
