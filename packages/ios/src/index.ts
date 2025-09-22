// Default exports now use WebDriverAgent for unified iOS automation
export { IOSDevice } from './device-wda';
export type { IOSDeviceOpt, IOSDeviceInputOpt } from './device-wda';

export { IOSAgent, agentFromIOSDevice, agentFromIOSSimulator } from './agent';

export {
  checkIOSEnvironment,
  getConnectedDevices,
  getDefaultDevice,
  isSimulator,
  ensureSimulatorBooted,
  getSimulatorsByDeviceType,
  getSimulatorsByRuntime,
  installApp,
  uninstallApp,
  launchApp,
  terminateApp,
} from './utils-wda';
export type { IOSDeviceInfo } from './utils-wda';

// WebDriverAgent specific exports
export { WebDriverAgentBackend } from './wda-backend';
export { WDAManager } from './wda-manager';
export type { WDASession, WDAElement, WDAElementInfo } from './wda-backend';
export type { WDAConfig } from './wda-manager';

// Legacy idb-based exports (for backwards compatibility)
export { IOSDevice as IOSDeviceIDB } from './device';
export {
  checkIOSEnvironment as checkIOSEnvironmentIDB,
  getConnectedDevices as getConnectedDevicesIDB,
  getDefaultDevice as getDefaultDeviceIDB,
  isSimulator as isSimulatorIDB,
  ensureSimulatorBooted as ensureSimulatorBootedIDB,
  getSimulatorsByDeviceType as getSimulatorsByDeviceTypeIDB,
  getSimulatorsByRuntime as getSimulatorsByRuntimeIDB,
  installApp as installAppIDB,
  uninstallApp as uninstallAppIDB,
  launchApp as launchAppIDB,
  terminateApp as terminateAppIDB,
} from './utils';