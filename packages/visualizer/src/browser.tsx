import './component/playground/index.less';
import './component/universal-playground.less';

// Re-export components that are safe for browser use (excluding Node.js dependent components)
// NOTE: replay-scripts not exported here as it has Node.js dependencies
export { useEnvConfig } from './component/store/store';

export {
  colorForName,
  highlightColorForType,
  globalThemeConfig,
} from './component/color';

export { EnvConfig } from './component/env-config';

export { Logo } from './component/logo';
export { iconForStatus, timeCostStrElement } from './component/misc';
// NOTE: useServerValid is not exported here as it has Node.js dependencies

export { PlaygroundResultView } from './component/playground/PlaygroundResult';
export type { PlaygroundResult } from './component/playground/playground-types';
// NOTE: ServiceModeControl is not exported here as it has Node.js dependencies
export { ContextPreview } from './component/playground/ContextPreview';
// NOTE: PromptInput is not exported here as it has Node.js dependencies through playground-utils
export { Player } from './component/player';
export { Blackboard } from './component/blackboard';
export { GithubStar } from './component/github-star';

// NOTE: playground-utils is not exported here as it has Node.js dependencies through @midscene/web-integration

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
  // NOTE: ReplayScriptsInfo not exported here as it has Node.js dependencies
} from './component/universal-playground/types';

// Export providers - ONLY BROWSER-SAFE ONES
export {
  LocalStorageProvider,
  MemoryStorageProvider,
  NoOpStorageProvider,
} from './component/universal-playground/providers/storage-provider';
export {
  BaseContextProvider,
  StaticContextProvider,
  NoOpContextProvider,
} from './component/universal-playground/providers/context-provider';
