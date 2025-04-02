export { Logo } from './component/logo';
// export { BrowserExtensionPlayground } from './component/playground/index';
export { globalThemeConfig } from './component/color';
export { useEnvConfig } from './component/store/store';

// export {
//   type WorkerRequestGetContext,
//   type WorkerRequestSaveContext,
//   type WorkerResponseGetContext,
//   type WorkerResponseSaveContext,
//   workerMessageTypes,
//   currentWindowId,
//   sendToWorker,
// } from './extension/utils';

export { useServerValid } from './component/playground/useServerValid';
export {
  type AnimationScript,
  type ReplayScriptsInfo,
  allScriptsFromDump,
  generateAnimationScripts,
} from './component/replay-scripts';


export { PlaygroundResultView } from './component/playground/PlaygroundResult';
export type { PlaygroundResult } from './component/playground/playground-types';

export { ServiceModeControl } from './component/playground/ServiceModeControl';
export { ContextPreview } from './component/playground/ContextPreview';
export { PromptInput } from './component/playground/PromptInput';
