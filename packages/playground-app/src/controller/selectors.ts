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
  const defaultConfig: UniversalPlaygroundConfig = {
    showContextPreview: false,
    layout: 'vertical',
    showVersionInfo: false,
    enableScrollToBottom: false,
    serverMode: true,
    showEnvConfigReminder: false,
    showClearButton: false,
    showSystemMessageHeader: false,
    promptInputChrome: {
      variant: 'minimal',
      placeholder: 'Type a message',
      primaryActionLabel: 'Action',
    },
    executionFlow: {
      collapsible: true,
    },
    deviceType: state.deviceType,
    executionUx: {
      hints: state.executionUxHints,
      countdownSeconds: state.countdownSeconds,
    },
  };

  return {
    ...defaultConfig,
    ...playgroundConfig,
    executionFlow: {
      ...defaultConfig.executionFlow,
      ...playgroundConfig?.executionFlow,
    },
    executionUx: {
      ...defaultConfig.executionUx,
      ...playgroundConfig?.executionUx,
    },
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
