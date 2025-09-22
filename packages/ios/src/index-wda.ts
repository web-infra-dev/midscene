// WebDriverAgent-based iOS automation (unified for simulators and real devices)
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