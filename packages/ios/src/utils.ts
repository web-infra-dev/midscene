import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const debugUtils = getDebug('ios:utils');

export async function checkIOSEnvironment(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    // Check if xcrun is available
    const { stdout: xcrunPath } = await execAsync('which xcrun');
    if (!xcrunPath.trim()) {
      return {
        available: false,
        error:
          'xcrun not found. Please install Xcode Command Line Tools: xcode-select --install',
      };
    }

    // Check if simctl is available
    await execAsync('xcrun simctl help');

    // Check if xcodebuild is available (required for WebDriverAgent)
    try {
      await execAsync('xcodebuild -version');
    } catch (error) {
      return {
        available: false,
        error: 'xcodebuild not found. Please install Xcode from the App Store',
      };
    }

    // Check if curl is available (required for WDA HTTP requests)
    const { stdout: curlPath } = await execAsync('which curl');
    if (!curlPath.trim()) {
      return {
        available: false,
        error: 'curl not found. Please install curl or update your system',
      };
    }

    debugUtils('iOS environment is available for WebDriverAgent');
    return { available: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugUtils(`iOS environment not available: ${errorMsg}`);

    if (errorMsg.includes('unable to find utility "simctl"')) {
      return {
        available: false,
        error:
          'iOS Simulator (simctl) not available. Please install Xcode from the App Store or install Xcode Command Line Tools with simulator support.',
      };
    } else if (errorMsg.includes('xcrun')) {
      return {
        available: false,
        error:
          'Xcode Command Line Tools not properly configured. Please run: sudo xcode-select --reset',
      };
    } else {
      return {
        available: false,
        error: `iOS development environment not available: ${errorMsg}`,
      };
    }
  }
}

export interface IOSDeviceInfo {
  udid: string;
  name: string;
  state: string;
  isSimulator: boolean;
  isAvailable: boolean;
  deviceType?: string;
  runtime?: string;
}

export async function getConnectedDevices(): Promise<IOSDeviceInfo[]> {
  // First check if iOS environment is available
  const envCheck = await checkIOSEnvironment();
  if (!envCheck.available) {
    throw new Error(`iOS environment not available: ${envCheck.error}`);
  }

  const devices: IOSDeviceInfo[] = [];

  try {
    // Get simulators from simctl
    const { stdout: simctlOutput } = await execAsync(
      'xcrun simctl list devices --json',
    );
    const simctlData = JSON.parse(simctlOutput);

    // Parse simulators
    for (const [runtime, deviceList] of Object.entries(simctlData.devices)) {
      if (Array.isArray(deviceList)) {
        for (const device of deviceList) {
          const deviceInfo = device as any;
          devices.push({
            udid: deviceInfo.udid,
            name: deviceInfo.name,
            state: deviceInfo.state,
            isSimulator: true,
            isAvailable: deviceInfo.isAvailable !== false,
            deviceType: deviceInfo.deviceTypeIdentifier,
            runtime: runtime,
          });
        }
      }
    }

    debugUtils(
      `Found ${devices.filter((d) => d.isSimulator).length} simulators`,
    );
  } catch (error) {
    debugUtils(`Failed to get simulators: ${error}`);
    throw new Error(`Failed to get iOS simulators: ${error}`);
  }

  // Try to get real devices using instruments (basic detection)
  try {
    const { stdout: instrumentsOutput } = await execAsync(
      'instruments -s devices',
    );
    const lines = instrumentsOutput.split('\n');

    for (const line of lines) {
      const match = line.match(
        /^(.+?)\s+\((.+?)\)\s+\[([A-F0-9-]+)\](?:\s+\(Simulator\))?$/,
      );
      if (match) {
        const [, name, version, udid] = match;
        const isSimulator = line.includes('(Simulator)');

        if (!isSimulator && !devices.find((d) => d.udid === udid)) {
          devices.push({
            udid: udid,
            name: name.trim(),
            state: 'Connected',
            isSimulator: false,
            isAvailable: true,
            deviceType: 'Physical Device',
            runtime: version,
          });
        }
      }
    }

    debugUtils(
      `Found ${devices.filter((d) => !d.isSimulator).length} real devices via instruments`,
    );
  } catch (instrumentsError) {
    debugUtils(
      `Failed to get real devices via instruments: ${instrumentsError}`,
    );
    // Don't throw error here - real device detection is optional
  }

  debugUtils(
    `Total found ${devices.length} iOS devices (${devices.filter((d) => d.isSimulator).length} simulators, ${devices.filter((d) => !d.isSimulator).length} real devices)`,
  );
  return devices;
}

export async function getDefaultDevice(): Promise<IOSDeviceInfo> {
  const devices = await getConnectedDevices();

  // Prefer booted simulators first (most reliable for WebDriverAgent)
  const bootedSimulator = devices.find(
    (d) => d.isSimulator && d.state === 'Booted' && d.isAvailable,
  );
  if (bootedSimulator) {
    debugUtils(`Using booted simulator: ${bootedSimulator.name}`);
    return bootedSimulator;
  }

  // Fall back to any available simulator
  const availableSimulator = devices.find(
    (d) => d.isSimulator && d.isAvailable,
  );
  if (availableSimulator) {
    debugUtils(`Using available simulator: ${availableSimulator.name}`);
    return availableSimulator;
  }

  // Finally try real devices (requires manual WebDriverAgent setup)
  const realDevice = devices.find((d) => !d.isSimulator && d.isAvailable);
  if (realDevice) {
    debugUtils(
      `Using real device: ${realDevice.name} (WebDriverAgent setup required)`,
    );
    return realDevice;
  }

  // If no devices available, throw error
  throw new Error(
    'No iOS devices available. Make sure you have iOS simulators installed.',
  );
}

export async function isSimulator(udid: string): Promise<boolean> {
  const devices = await getConnectedDevices();
  const device = devices.find((d) => d.udid === udid);
  return device?.isSimulator ?? false;
}

export async function ensureSimulatorBooted(udid: string): Promise<void> {
  try {
    const devices = await getConnectedDevices();
    const device = devices.find((d) => d.udid === udid);

    if (!device) {
      throw new Error(`Device with UDID ${udid} not found`);
    }

    if (!device.isSimulator) {
      debugUtils(`Device ${udid} is not a simulator, skipping boot check`);
      return;
    }

    if (device.state === 'Booted') {
      debugUtils(`Simulator ${udid} is already booted`);
      return;
    }

    debugUtils(`Booting simulator ${udid}...`);
    await execFileAsync('xcrun', ['simctl', 'boot', udid]);

    // Wait for simulator to boot
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (attempts < maxAttempts) {
      const updatedDevices = await getConnectedDevices();
      const updatedDevice = updatedDevices.find((d) => d.udid === udid);

      if (updatedDevice?.state === 'Booted') {
        debugUtils(`Simulator ${udid} booted successfully`);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Simulator ${udid} failed to boot within timeout`);
  } catch (error) {
    debugUtils(`Failed to ensure simulator booted: ${error}`);
    throw new Error(`Failed to boot simulator ${udid}: ${error}`);
  }
}

export async function getSimulatorsByDeviceType(
  deviceType?: string,
): Promise<IOSDeviceInfo[]> {
  const devices = await getConnectedDevices();
  const simulators = devices.filter((d) => d.isSimulator && d.isAvailable);

  if (!deviceType) {
    return simulators;
  }

  return simulators.filter(
    (d) =>
      d.name.toLowerCase().includes(deviceType.toLowerCase()) ||
      d.deviceType?.toLowerCase().includes(deviceType.toLowerCase()),
  );
}

export async function getSimulatorsByRuntime(
  runtime?: string,
): Promise<IOSDeviceInfo[]> {
  const devices = await getConnectedDevices();
  const simulators = devices.filter((d) => d.isSimulator && d.isAvailable);

  if (!runtime) {
    return simulators;
  }

  return simulators.filter((d) =>
    d.runtime?.toLowerCase().includes(runtime.toLowerCase()),
  );
}
