import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const debugWDA = getDebug('ios:wda-manager');

export interface WDAConfig {
  udid: string;
  port: number;
  host?: string;
  wdaPath?: string;
  bundleId?: string;
  usePrebuiltWDA?: boolean;
}

export class WDAManager {
  private static instances = new Map<string, WDAManager>();
  private config: WDAConfig;
  private isStarted = false;

  private constructor(config: WDAConfig) {
    this.config = {
      bundleId: 'com.apple.WebDriverAgentRunner.xctrunner',
      usePrebuiltWDA: true,
      host: 'localhost',
      ...config,
      port: config.port || 8100,
    };
  }

  static getInstance(udid: string, port = 8100, host?: string): WDAManager {
    const key = `${host || 'localhost'}:${udid}:${port}`;
    if (!WDAManager.instances.has(key)) {
      WDAManager.instances.set(key, new WDAManager({ udid, port, host }));
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
      debugWDA(
        `WDA started successfully for device ${this.config.udid} on port ${this.config.port}`,
      );
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
      // Kill any remaining WDA processes (external ones)
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
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
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
              if (
                deviceInfo.udid === this.config.udid &&
                deviceInfo.state === 'Booted'
              ) {
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
        // For real devices, assume they are connected if we reach this point
        // WebDriverAgent will validate the connection when it starts
        debugWDA(`Assuming real device ${this.config.udid} is connected`);
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
    // For real devices, assume port forwarding is handled externally
    // Users can set up port forwarding manually using:
    // iproxy <local_port> 8100 <device_udid>
    debugWDA(`Skipping automatic port forwarding for ${this.config.udid}`);
    debugWDA('For real devices, set up port forwarding manually if needed:');
    debugWDA(`iproxy ${this.config.port} 8100 ${this.config.udid}`);
  }

  private async stopPortForwarding(): Promise<void> {
    // Port forwarding is handled externally, nothing to stop
    debugWDA(`Port forwarding cleanup skipped for ${this.config.udid}`);
  }

  private async startWDA(): Promise<void> {
    // We no longer start WDA automatically - just check if it's running
    await this.checkWDAPreparation();
    debugWDA('WebDriverAgent verification completed');
  }

  private async checkWDAPreparation(): Promise<void> {
    // Check if WebDriverAgent is already running on the expected port
    if (await this.isWDARunning()) {
      debugWDA(`WebDriverAgent is already running on port ${this.config.port}`);
      return;
    }

    // If not running, throw error with setup instructions
    throw new Error(
      `WebDriverAgent is not running on port ${this.config.port}. Please start WebDriverAgent manually:
1. Install: npm install appium-webdriveragent
2. Build and run WebDriverAgent using Xcode or xcodebuild  
3. Ensure it's listening on port ${this.config.port}
4. For simulators: Use iOS Simulator
5. For real devices: Configure signing and trust certificates`,
    );
  }

  private async isWDARunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `curl -s http://${this.config.host}:${this.config.port}/status || echo "FAILED"`,
      );
      return !stdout.includes('FAILED') && stdout.includes('sessionId');
    } catch (error) {
      return false;
    }
  }

  private async waitForWDA(timeout = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isWDARunning()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
