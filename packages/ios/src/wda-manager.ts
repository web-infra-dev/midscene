import { exec, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const debugWDA = getDebug('ios:wda-manager');

export interface WDAConfig {
  udid: string;
  port: number;
  wdaPath?: string;
  bundleId?: string;
  usePrebuiltWDA?: boolean;
}

export class WDAManager {
  private static instances = new Map<string, WDAManager>();
  private process: ChildProcess | null = null;
  private config: WDAConfig;
  private isStarted = false;

  private constructor(config: WDAConfig) {
    this.config = {
      bundleId: 'com.apple.WebDriverAgentRunner.xctrunner',
      usePrebuiltWDA: true,
      ...config,
      port: config.port || 8100,
    };
  }

  static getInstance(udid: string, port: number = 8100): WDAManager {
    const key = `${udid}:${port}`;
    if (!WDAManager.instances.has(key)) {
      WDAManager.instances.set(key, new WDAManager({ udid, port }));
    }
    return WDAManager.instances.get(key)!;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      debugWDA(`WDA already started for device ${this.config.udid}`);
      return;
    }

    try {
      // Check if WDA is already running on the port
      if (await this.isWDARunning()) {
        debugWDA(`WDA already running on port ${this.config.port}`);
        this.isStarted = true;
        return;
      }

      // Check device connection
      await this.ensureDeviceConnected();

      // Setup port forwarding for real devices
      if (!(await this.isSimulator())) {
        await this.setupPortForwarding();
      }

      // Start WebDriverAgent
      await this.startWDA();
      
      // Wait for WDA to be ready
      await this.waitForWDA();
      
      this.isStarted = true;
      debugWDA(`WDA started successfully for device ${this.config.udid} on port ${this.config.port}`);
    } catch (error) {
      debugWDA(`Failed to start WDA: ${error}`);
      throw new Error(`Failed to start WebDriverAgent: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      if (this.process) {
        this.process.kill('SIGTERM');
        this.process = null;
      }

      // Kill any remaining WDA processes
      await this.killWDAProcesses();

      // Stop port forwarding for real devices
      if (!(await this.isSimulator())) {
        await this.stopPortForwarding();
      }

      this.isStarted = false;
      debugWDA(`WDA stopped for device ${this.config.udid}`);
    } catch (error) {
      debugWDA(`Error stopping WDA: ${error}`);
      // Don't throw, cleanup should be best-effort
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  getPort(): number {
    return this.config.port;
  }

  private async ensureDeviceConnected(): Promise<void> {
    try {
      if (await this.isSimulator()) {
        // Check simulator is booted
        const { stdout } = await execAsync('xcrun simctl list devices --json');
        const devices = JSON.parse(stdout);
        
        let found = false;
        for (const [runtime, deviceList] of Object.entries(devices.devices)) {
          if (Array.isArray(deviceList)) {
            for (const device of deviceList) {
              const deviceInfo = device as any;
              if (deviceInfo.udid === this.config.udid && deviceInfo.state === 'Booted') {
                found = true;
                break;
              }
            }
          }
        }
        
        if (!found) {
          throw new Error(`Simulator ${this.config.udid} is not booted`);
        }
      } else {
        // Check real device is connected
        const { stdout } = await execAsync('idb list-targets --json');
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const targets = lines.map(line => JSON.parse(line));
        
        const device = targets.find(target => target.udid === this.config.udid && target.type === 'device');
        if (!device) {
          throw new Error(`Real device ${this.config.udid} is not connected`);
        }
      }
    } catch (error) {
      throw new Error(`Device ${this.config.udid} is not available: ${error}`);
    }
  }

  private async isSimulator(): Promise<boolean> {
    try {
      // Try to find device in simulator list
      const { stdout } = await execAsync('xcrun simctl list devices --json');
      const devices = JSON.parse(stdout);
      
      for (const [runtime, deviceList] of Object.entries(devices.devices)) {
        if (Array.isArray(deviceList)) {
          for (const device of deviceList) {
            const deviceInfo = device as any;
            if (deviceInfo.udid === this.config.udid) {
              return true;
            }
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private async setupPortForwarding(): Promise<void> {
    try {
      // Kill any existing iproxy processes for this port
      await execAsync(`pkill -f "iproxy ${this.config.port}"`).catch(() => {});
      
      // Start iproxy for port forwarding
      const iproxyProcess = spawn('iproxy', [
        this.config.port.toString(),
        '8100', // WDA default port on device
        this.config.udid,
      ]);

      iproxyProcess.on('error', (error) => {
        debugWDA(`iproxy error: ${error}`);
      });

      // Wait a moment for iproxy to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      debugWDA(`Port forwarding setup: localhost:${this.config.port} -> ${this.config.udid}:8100`);
    } catch (error) {
      throw new Error(`Failed to setup port forwarding: ${error}`);
    }
  }

  private async stopPortForwarding(): Promise<void> {
    try {
      await execAsync(`pkill -f "iproxy ${this.config.port}"`);
      debugWDA(`Stopped port forwarding for port ${this.config.port}`);
    } catch (error) {
      // Ignore errors, process might not exist
    }
  }

  private async startWDA(): Promise<void> {
    const isSimulator = await this.isSimulator();
    
    if (isSimulator) {
      // For simulators, use xcodebuild
      await this.startWDAForSimulator();
    } else {
      // For real devices, use xcodebuild with device destination
      await this.startWDAForDevice();
    }
  }

  private async startWDAForSimulator(): Promise<void> {
    const xcodebuildArgs = [
      '-project', 'WebDriverAgent.xcodeproj',
      '-scheme', 'WebDriverAgentRunner',
      '-destination', `id=${this.config.udid}`,
      'test',
    ];

    debugWDA(`Starting WDA for simulator with: xcodebuild ${xcodebuildArgs.join(' ')}`);
    
    this.process = spawn('xcodebuild', xcodebuildArgs, {
      cwd: this.getWDAPath(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('ServerURLHere->')) {
        debugWDA('WDA server started successfully');
      }
    });

    this.process.stderr?.on('data', (data) => {
      debugWDA(`WDA stderr: ${data.toString()}`);
    });

    this.process.on('error', (error) => {
      debugWDA(`WDA process error: ${error}`);
    });

    this.process.on('exit', (code) => {
      debugWDA(`WDA process exited with code ${code}`);
      this.isStarted = false;
    });
  }

  private async startWDAForDevice(): Promise<void> {
    // Check if WebDriverAgentRunner is installed and properly signed
    await this.checkWDAInstallation();

    const xcodebuildArgs = [
      '-project', 'WebDriverAgent.xcodeproj',
      '-scheme', 'WebDriverAgentRunner',
      '-destination', `id=${this.config.udid}`,
      'test',
    ];

    debugWDA(`Starting WDA for real device with: xcodebuild ${xcodebuildArgs.join(' ')}`);
    
    this.process = spawn('xcodebuild', xcodebuildArgs, {
      cwd: this.getWDAPath(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('ServerURLHere->')) {
        debugWDA('WDA server started successfully');
      }
      if (output.includes('Code Signing Error') || output.includes('Signing certificate')) {
        debugWDA('WDA signing error detected - please configure development team in Xcode');
      }
      if (output.includes('could not launch') || output.includes('Installation failed')) {
        debugWDA('WDA installation failed - app may need to be trusted on device');
      }
    });

    this.process.stderr?.on('data', (data) => {
      const stderr = data.toString();
      debugWDA(`WDA stderr: ${stderr}`);
      
      if (stderr.includes('untrusted developer')) {
        debugWDA('Device needs to trust developer certificate. Go to Settings > General > VPN & Device Management');
      }
    });

    this.process.on('error', (error) => {
      debugWDA(`WDA process error: ${error}`);
    });

    this.process.on('exit', (code) => {
      debugWDA(`WDA process exited with code ${code}`);
      this.isStarted = false;
    });
  }

  private async checkWDAInstallation(): Promise<void> {
    try {
      // Check if WebDriverAgentRunner is already installed
      const { stdout } = await execAsync(`idb list-apps --udid ${this.config.udid} --json`);
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      
      let isInstalled = false;
      for (const line of lines) {
        try {
          const app = JSON.parse(line);
          if (app.bundle_id && app.bundle_id.includes('WebDriverAgentRunner')) {
            isInstalled = true;
            debugWDA(`WebDriverAgentRunner already installed: ${app.bundle_id}`);
            break;
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }

      if (!isInstalled) {
        debugWDA('WebDriverAgentRunner not found on device - it will be installed during first run');
        debugWDA('Note: You may need to:');
        debugWDA('1. Configure Development Team in WebDriverAgent.xcodeproj');
        debugWDA('2. Trust the developer certificate on the device');
        debugWDA('3. Go to Settings > General > VPN & Device Management on the device');
      }
    } catch (error) {
      debugWDA(`Could not check WDA installation status: ${error}`);
      // Continue anyway, xcodebuild will handle installation
    }
  }

  private getWDAPath(): string {
    if (this.config.wdaPath) {
      return this.config.wdaPath;
    }
    
    // Use require.resolve to find the appium-webdriveragent package reliably
    let wdaPath: string;
    try {
      // Try to resolve the package from this module's context
      const packageJsonPath = require.resolve('appium-webdriveragent/package.json');
      wdaPath = path.dirname(packageJsonPath);
    } catch (error) {
      // Fallback to relative path resolution
      wdaPath = path.resolve(__dirname, '../../node_modules/appium-webdriveragent');
    }
    
    const projectPath = path.join(wdaPath, 'WebDriverAgent.xcodeproj');
    
    if (fs.existsSync(projectPath)) {
      debugWDA(`Found WebDriverAgent at: ${wdaPath}`);
    } else {
      debugWDA(`WebDriverAgent not found at: ${wdaPath}`);
      debugWDA('Run "npx @midscene/ios prepare" to install WebDriverAgent');
    }
    
    return wdaPath;
  }

  private async isWDARunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`curl -s http://localhost:${this.config.port}/status || echo "FAILED"`);
      return !stdout.includes('FAILED') && stdout.includes('sessionId');
    } catch (error) {
      return false;
    }
  }

  private async waitForWDA(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await this.isWDARunning()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`WebDriverAgent did not start within ${timeout}ms`);
  }

  private async killWDAProcesses(): Promise<void> {
    try {
      // Kill xcodebuild processes
      await execAsync('pkill -f "xcodebuild.*WebDriverAgent"').catch(() => {});
      
      // Kill WebDriverAgentRunner processes
      await execAsync('pkill -f "WebDriverAgentRunner"').catch(() => {});
      
      debugWDA('Killed WDA processes');
    } catch (error) {
      // Ignore errors, processes might not exist
    }
  }
}