export { useStaticPageAgent } from './component/playground/useStaticPageAgent';
import './component/playground/index.less';
export {
  type AnimationScript,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  generateAnimationScripts,
} from './component/replay-scripts';
export { useEnvConfig } from './component/store/store';

export {
  colorForName,
  highlightColorForType,
  globalThemeConfig,
} from './component/color';

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
