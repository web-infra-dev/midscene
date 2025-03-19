export { default as Logo } from './component/logo';
export {
  Playground,
  extensionAgentForTab,
} from './component/playground-component';
export { globalThemeConfig } from './component/color';
export { useEnvConfig } from './component/store';

export {
  type WorkerRequestGetContext,
  type WorkerRequestSaveContext,
  type WorkerResponseGetContext,
  type WorkerResponseSaveContext,
  workerMessageTypes,
  getExtensionVersion,
  getTabInfo,
  currentWindowId,
  sendToWorker,
} from './extension/utils';
