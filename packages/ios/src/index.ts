export { IOSDevice } from './device';
export type { IOSDeviceOpt, IOSDeviceInputOpt } from './device';

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
} from './utils';
export type { IOSDeviceInfo } from './utils';