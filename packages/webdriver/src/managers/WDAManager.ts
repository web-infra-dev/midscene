import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { BaseServiceManager } from './ServiceManager';

const execAsync = promisify(exec);
const debugWDA = getDebug('webdriver:wda-manager');

export interface WDAConfig {
  port: number;
  host?: string;
  wdaPath?: string;
  bundleId?: string;
  usePrebuiltWDA?: boolean;
}

export class WDAManager extends BaseServiceManager {
  private static instances = new Map<string, WDAManager>();
  private config: WDAConfig;
  private isStarted = false;

  private constructor(config: WDAConfig) {
    super(config.port, config.host);
    this.config = {
      bundleId: 'com.apple.WebDriverAgentRunner.xctrunner',
      usePrebuiltWDA: true,
      host: 'localhost',
      ...config,
      port: config.port || DEFAULT_WDA_PORT,
    };
  }

  static getInstance(port = DEFAULT_WDA_PORT, host?: string): WDAManager {
    const key = `${host || 'localhost'}:${port}`;
    if (!WDAManager.instances.has(key)) {
      WDAManager.instances.set(key, new WDAManager({ port, host }));
    }
    return WDAManager.instances.get(key)!;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      debugWDA(
        `WDA already started on ${this.config.host}:${this.config.port}`,
      );
      return;
    }

    try {
      // Check if WDA is already running on the port
      if (await this.isWDARunning()) {
        debugWDA(`WDA already running on port ${this.config.port}`);
        this.isStarted = true;
        return;
      }

      // Note: Device connection and port forwarding are handled externally
      // We only check if WebDriverAgent is running

      // Start WebDriverAgent
      await this.startWDA();

      // Wait for WDA to be ready
      await this.waitForWDA();

      this.isStarted = true;
      debugWDA(
        `WDA started successfully on ${this.config.host}:${this.config.port}`,
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
      this.isStarted = false;
      debugWDA(`WDA stopped on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      debugWDA(`Error stopping WDA: ${error}`);
      // Don't throw, cleanup should be best-effort
    }
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  private async startWDA(): Promise<void> {
    // We require WebDriverAgent to be started manually
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
      `WebDriverAgent is not running on ${this.config.host}:${this.config.port}. Please start WebDriverAgent manually:

🔧 Setup Instructions:
1. Install WebDriverAgent: npm install appium-webdriveragent
2. Build and run WebDriverAgent:
   - For simulators: Use Xcode to run WebDriverAgentRunner on your target simulator
   - For real devices: Build WebDriverAgentRunner and install on your device
3. Ensure WebDriverAgent is listening on ${this.config.host}:${this.config.port}

💡 Alternative: You can also specify a different host/port where WebDriverAgent is running.`,
    );
  }

  private async isWDARunning(): Promise<boolean> {
    try {
      const url = `http://${this.config.host}:${this.config.port}/status`;
      const response = await fetch(url);

      if (!response.ok) {
        return false;
      }

      const responseText = await response.text();
      return responseText.includes('sessionId');
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
