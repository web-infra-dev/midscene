import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { IOSDevice, type IOSDeviceOpt } from './device';
import { getConnectedDevices, getDefaultDevice } from './utils';

const debugAgent = getDebug('ios:agent');

type IOSAgentOpt = AgentOpt;

export class IOSAgent extends PageAgent<IOSDevice> {
  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }
}

export async function agentFromIOSDevice(
  deviceId?: string,
  opts?: IOSAgentOpt & IOSDeviceOpt,
) {
  if (!deviceId) {
    const defaultDevice = await getDefaultDevice();
    deviceId = defaultDevice.udid;

    debugAgent(
      'deviceId not specified, will use the default device (deviceId = %s)',
      deviceId,
    );
  }

  const device = new IOSDevice(deviceId, {
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    keyboardDismissStrategy: opts?.keyboardDismissStrategy,
    customActions: opts?.customActions,
    wdaPort: opts?.wdaPort,
    wdaHost: opts?.wdaHost,
    useWDA: opts?.useWDA,
  });

  await device.connect();

  return new IOSAgent(device, opts);
}

export async function agentFromIOSSimulator(
  deviceName?: string,
  opts?: IOSAgentOpt & IOSDeviceOpt,
) {
  const devices = await getConnectedDevices();
  const simulators = devices.filter((d) => d.isSimulator);

  let targetDevice;
  if (deviceName) {
    targetDevice = simulators.find((d) => d.name.includes(deviceName));
    if (!targetDevice) {
      throw new Error(
        `Simulator with name containing "${deviceName}" not found`,
      );
    }
  } else {
    targetDevice = simulators.find((d) => d.state === 'Booted');
    if (!targetDevice) {
      targetDevice = simulators[0];
      if (targetDevice) {
        debugAgent(
          'No booted simulator found, using first available: %s',
          targetDevice.name,
        );
      }
    }
  }

  if (!targetDevice) {
    throw new Error('No iOS simulator available');
  }

  debugAgent(
    'Using iOS simulator: %s (deviceId = %s)',
    targetDevice.name,
    targetDevice.udid,
  );

  return agentFromIOSDevice(targetDevice.udid, opts);
}
