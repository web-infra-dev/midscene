import './component/playground/index.less';
import './component/universal-playground/index.less';

export {
  type AnimationScript,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  generateAnimationScripts,
} from './utils/replay-scripts';
export { useEnvConfig } from './store/store';

export {
  colorForName,
  highlightColorForType,
  globalThemeConfig,
} from './utils/color';

export { EnvConfig } from './component/env-config';
export { EnvConfigReminder } from './component/env-config-reminder';

export { Logo } from './component/logo';
export { iconForStatus, timeCostStrElement } from './component/misc';
export { useServerValid } from './hooks/useServerValid';
export {
  useSafeOverrideAIConfig,
  safeOverrideAIConfig,
} from './hooks/useSafeOverrideAIConfig';

export { PlaygroundResultView } from './component/playground-result';
export type { PlaygroundResult } from './types';
export { ServiceModeControl } from './component/service-mode-control';
export { ContextPreview } from './component/context-preview';
export { PromptInput } from './component/prompt-input';
export { CodeDisplay } from './component/code-display';
export { CodeBlock } from './component/code-block';
export { useCodeHighlight } from './hooks/useCodeHighlight';
export type {
  SupportedLanguage,
  CodeHighlightOptions,
} from './hooks/useCodeHighlight';
export type { CodeBlockProps } from './component/code-block';
export { Player } from './component/player';
export { Blackboard } from './component/blackboard';
export { GithubStar } from './component/github-star';

// Export playground utilities
export {
  actionNameForType,
  staticAgentFromContext,
  getPlaceholderForType,
} from './utils/playground-utils';

export { timeStr, filterBase64Value } from './utils';

export { default as ShinyText } from './component/shiny-text';

// Export Universal Playground
export {
  UniversalPlayground,
  default as UniversalPlaygroundDefault,
} from './component/universal-playground';
export type {
  UniversalPlaygroundProps,
  PlaygroundSDKLike,
  StorageProvider,
  ContextProvider,
  UniversalPlaygroundConfig,
  PlaygroundBranding,
  InfoListItem,
  FormValue,
  ExecutionOptions,
  ProgressCallback,
} from './types';

// Export providers
export {
  LocalStorageProvider,
  MemoryStorageProvider,
  NoOpStorageProvider,
} from './component/universal-playground/providers/storage-provider';
export {
  BaseContextProvider,
  AgentContextProvider,
  StaticContextProvider,
  NoOpContextProvider,
} from './component/universal-playground/providers/context-provider';
