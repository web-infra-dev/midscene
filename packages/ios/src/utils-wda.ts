import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const debugUtils = getDebug('ios:utils');

export async function checkIOSEnvironment(): Promise<{ available: boolean; error?: string }> {
  try {
    // Check if xcrun is available
    const { stdout: xcrunPath } = await execAsync('which xcrun');
    if (!xcrunPath.trim()) {
      return { 
        available: false, 
        error: 'xcrun not found. Please install Xcode Command Line Tools: xcode-select --install' 
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
        error: 'xcodebuild not found. Please install Xcode from the App Store'
      };
    }
    
    // Check if idb is available (required for real device management)
    const { stdout: idbPath } = await execAsync('which idb');
    if (!idbPath.trim()) {
      return { 
        available: false, 
        error: 'idb (iOS Development Bridge) not found. Please install idb: brew install idb' 
      };
    }
    
    // Check if curl is available (required for WDA HTTP requests)
    const { stdout: curlPath } = await execAsync('which curl');
    if (!curlPath.trim()) {
      return {
        available: false,
        error: 'curl not found. Please install curl or update your system'
      };
    }

    // Check if iproxy is available (required for real device port forwarding)
    try {
      await execAsync('which iproxy');
    } catch (error) {
      debugUtils('iproxy not found - real device support may be limited');
      // Don't fail here, as iproxy might be installed with different tools
    }
    
    debugUtils('iOS environment is available for WebDriverAgent');
    return { available: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugUtils(`iOS environment not available: ${errorMsg}`);
    
    if (errorMsg.includes('unable to find utility "simctl"')) {
      return { 
        available: false, 
        error: 'iOS Simulator (simctl) not available. Please install Xcode from the App Store or install Xcode Command Line Tools with simulator support.' 
      };
    } else if (errorMsg.includes('xcrun')) {
      return { 
        available: false, 
        error: 'Xcode Command Line Tools not properly configured. Please run: sudo xcode-select --reset' 
      };
    } else {
      return { 
        available: false, 
        error: `iOS development environment not available: ${errorMsg}` 
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
    const { stdout: simctlOutput } = await execAsync('xcrun simctl list devices --json');
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
    
    debugUtils(`Found ${devices.filter(d => d.isSimulator).length} simulators`);
  } catch (error) {
    debugUtils(`Failed to get simulators: ${error}`);
  }

  try {
    // Get real devices from idb
    const { stdout: idbOutput } = await execAsync('idb list-targets --json');
    const lines = idbOutput.trim().split('\n').filter(line => line.trim());
    const idbTargets = lines.map(line => JSON.parse(line));
    
    for (const target of idbTargets) {
      if (target.type !== 'simulator') {
        if (target.udid && target.name && target.type === 'device') {
          devices.push({
            udid: target.udid,
            name: target.name,
            state: target.state || 'Connected',
            isSimulator: false,
            isAvailable: true,
            deviceType: 'Physical Device',
            runtime: undefined,
          });
        }
      }
    }
    
    debugUtils(`Found ${devices.filter(d => !d.isSimulator).length} real devices`);
  } catch (error) {
    debugUtils(`Failed to get real devices via idb: ${error}`);
    
    // Fallback: try to get devices using instruments
    try {
      const { stdout: instrumentsOutput } = await execAsync('instruments -s devices');
      const lines = instrumentsOutput.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(.+?)\s+\((.+?)\)\s+\[([A-F0-9-]+)\](?:\s+\(Simulator\))?$/);
        if (match) {
          const [, name, version, udid] = match;
          const isSimulator = line.includes('(Simulator)');
          
          if (!isSimulator && !devices.find(d => d.udid === udid)) {
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
      
      debugUtils(`Found additional ${devices.filter(d => !d.isSimulator).length} real devices via instruments`);
    } catch (instrumentsError) {
      debugUtils(`Failed to get real devices via instruments: ${instrumentsError}`);
    }
  }
  
  debugUtils(`Total found ${devices.length} iOS devices (${devices.filter(d => d.isSimulator).length} simulators, ${devices.filter(d => !d.isSimulator).length} real devices)`);
  return devices;
}

export async function getDefaultDevice(): Promise<IOSDeviceInfo> {
  const devices = await getConnectedDevices();
  
  // Prefer real devices over simulators for WDA (better testing)
  const realDevice = devices.find(d => !d.isSimulator && d.isAvailable);
  if (realDevice) {
    debugUtils(`Using real device: ${realDevice.name}`);
    return realDevice;
  }
  
  // Fall back to booted simulators
  const bootedDevice = devices.find(d => d.state === 'Booted' && d.isAvailable);
  if (bootedDevice) {
    debugUtils(`Using booted simulator: ${bootedDevice.name}`);
    return bootedDevice;
  }
  
  // Fall back to any available simulator
  const availableDevice = devices.find(d => d.isAvailable);
  if (availableDevice) {
    debugUtils(`Using available device: ${availableDevice.name}`);
    return availableDevice;
  }
  
  // If no devices available, throw error
  throw new Error('No iOS devices available. Make sure you have iOS simulators installed or real devices connected.');
}

export async function isSimulator(udid: string): Promise<boolean> {
  const devices = await getConnectedDevices();
  const device = devices.find(d => d.udid === udid);
  return device?.isSimulator ?? false;
}

export async function ensureSimulatorBooted(udid: string): Promise<void> {
  try {
    const devices = await getConnectedDevices();
    const device = devices.find(d => d.udid === udid);
    
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
    await execAsync(`xcrun simctl boot ${udid}`);
    
    // Wait for simulator to boot
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    
    while (attempts < maxAttempts) {
      const updatedDevices = await getConnectedDevices();
      const updatedDevice = updatedDevices.find(d => d.udid === udid);
      
      if (updatedDevice?.state === 'Booted') {
        debugUtils(`Simulator ${udid} booted successfully`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    throw new Error(`Simulator ${udid} failed to boot within timeout`);
  } catch (error) {
    debugUtils(`Failed to ensure simulator booted: ${error}`);
    throw new Error(`Failed to boot simulator ${udid}: ${error}`);
  }
}

export async function getSimulatorsByDeviceType(deviceType?: string): Promise<IOSDeviceInfo[]> {
  const devices = await getConnectedDevices();
  const simulators = devices.filter(d => d.isSimulator && d.isAvailable);
  
  if (!deviceType) {
    return simulators;
  }
  
  return simulators.filter(d => 
    d.name.toLowerCase().includes(deviceType.toLowerCase()) ||
    d.deviceType?.toLowerCase().includes(deviceType.toLowerCase())
  );
}

export async function getSimulatorsByRuntime(runtime?: string): Promise<IOSDeviceInfo[]> {
  const devices = await getConnectedDevices();
  const simulators = devices.filter(d => d.isSimulator && d.isAvailable);
  
  if (!runtime) {
    return simulators;
  }
  
  return simulators.filter(d => 
    d.runtime?.toLowerCase().includes(runtime.toLowerCase())
  );
}

// App management functions (WDA-compatible)
export async function installApp(udid: string, appPath: string): Promise<void> {
  try {
    debugUtils(`Installing app ${appPath} on device ${udid}`);
    
    const isDeviceSimulator = await isSimulator(udid);
    if (isDeviceSimulator) {
      // Use simctl for simulators
      await execAsync(`xcrun simctl install ${udid} "${appPath}"`);
    } else {
      // Use idb for real devices
      await execAsync(`idb install --udid ${udid} "${appPath}"`);
    }
    
    debugUtils(`App installed successfully on ${udid}`);
  } catch (error) {
    debugUtils(`Failed to install app: ${error}`);
    throw new Error(`Failed to install app on ${udid}: ${error}`);
  }
}

export async function uninstallApp(udid: string, bundleId: string): Promise<void> {
  try {
    debugUtils(`Uninstalling app ${bundleId} from device ${udid}`);
    
    const isDeviceSimulator = await isSimulator(udid);
    if (isDeviceSimulator) {
      // Use simctl for simulators
      await execAsync(`xcrun simctl uninstall ${udid} ${bundleId}`);
    } else {
      // Use idb for real devices
      await execAsync(`idb uninstall --udid ${udid} ${bundleId}`);
    }
    
    debugUtils(`App uninstalled successfully from ${udid}`);
  } catch (error) {
    debugUtils(`Failed to uninstall app: ${error}`);
    throw new Error(`Failed to uninstall app from ${udid}: ${error}`);
  }
}

export async function launchApp(udid: string, bundleId: string): Promise<void> {
  try {
    debugUtils(`Launching app ${bundleId} on device ${udid}`);
    
    const isDeviceSimulator = await isSimulator(udid);
    if (isDeviceSimulator) {
      // Use simctl for simulators
      await execAsync(`xcrun simctl launch ${udid} ${bundleId}`);
    } else {
      // Use idb for real devices
      await execAsync(`idb launch --udid ${udid} ${bundleId}`);
    }
    
    debugUtils(`App launched successfully on ${udid}`);
  } catch (error) {
    debugUtils(`Failed to launch app: ${error}`);
    throw new Error(`Failed to launch app on ${udid}: ${error}`);
  }
}

export async function terminateApp(udid: string, bundleId: string): Promise<void> {
  try {
    debugUtils(`Terminating app ${bundleId} on device ${udid}`);
    
    const isDeviceSimulator = await isSimulator(udid);
    if (isDeviceSimulator) {
      // Use simctl for simulators
      await execAsync(`xcrun simctl terminate ${udid} ${bundleId}`);
    } else {
      // Use idb for real devices
      await execAsync(`idb kill --udid ${udid} ${bundleId}`);
    }
    
    debugUtils(`App terminated successfully on ${udid}`);
  } catch (error) {
    debugUtils(`Failed to terminate app: ${error}`);
    // Don't throw error for terminate, as app might not be running
  }
}