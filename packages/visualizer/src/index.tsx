import './component/playground/index.less';
import './component/universal-playground/index.less';

export {
  type AnimationScript,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  generateAnimationScripts,
} from './utils/replay-scripts';
export { useEnvConfig } from './component/store/store';

export {
  colorForName,
  highlightColorForType,
  globalThemeConfig,
} from './utils/color';

export { EnvConfig } from './component/env-config';

export { Logo } from './component/logo';
export { iconForStatus, timeCostStrElement } from './component/misc';
export { useServerValid } from './component/playground/useServerValid';

export { PlaygroundResultView } from './component/playground/PlaygroundResult';
export type { PlaygroundResult } from './component/playground/playground-types';
export { ServiceModeControl } from './component/playground/ServiceModeControl';
export { ContextPreview } from './component/playground/ContextPreview';
export { PromptInput } from './component/playground/PromptInput';
export { Player } from './component/player';
export { Blackboard } from './component/blackboard';
export { GithubStar } from './component/github-star';

// Export playground utilities
export {
  actionNameForType,
  staticAgentFromContext,
  getPlaceholderForType,
} from './component/playground/playground-utils';

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
} from './component/universal-playground/types';

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
