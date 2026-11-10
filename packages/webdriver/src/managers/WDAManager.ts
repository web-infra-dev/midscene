import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { normalizeWebDriverBaseUrl } from '../utils/base-url';
import { BaseServiceManager } from './ServiceManager';

const execAsync = promisify(exec);
const debugWDA = getDebug('webdriver:wda-manager');

export interface WDAConfig {
  port: number;
  host?: string;
  baseUrl?: string;
  wdaPath?: string;
  bundleId?: string;
  usePrebuiltWDA?: boolean;
}

export class WDAManager extends BaseServiceManager {
  private static instances = new Map<string, WDAManager>();
  private readonly baseUrl: string;
  private isStarted = false;

  private constructor(config: WDAConfig) {
    const address = config.baseUrl ? new URL(config.baseUrl) : undefined;
    super(
      address
        ? Number(address.port || (address.protocol === 'https:' ? 443 : 80))
        : config.port,
      address?.hostname ?? config.host,
    );
    this.baseUrl = config.baseUrl ?? super.getEndpoint();
  }

  static getInstance(
    port = DEFAULT_WDA_PORT,
    host?: string,
    baseUrl?: string,
  ): WDAManager {
    const key =
      baseUrl !== undefined
        ? normalizeWebDriverBaseUrl(baseUrl)
        : `http://${host || 'localhost'}:${port}`;
    if (!WDAManager.instances.has(key)) {
      WDAManager.instances.set(
        key,
        new WDAManager({ port, host, baseUrl: key }),
      );
    }
    return WDAManager.instances.get(key)!;
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      debugWDA('WDA already started');
      return;
    }

    try {
      // Check if WDA is already reachable at the configured API base URL
      if (await this.isWDARunning()) {
        debugWDA('WDA already running');
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
      debugWDA('WDA started successfully');
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
      debugWDA('WDA stopped');
    } catch (error) {
      debugWDA(`Error stopping WDA: ${error}`);
      // Don't throw, cleanup should be best-effort
    }
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  override getEndpoint(): string {
    return this.baseUrl;
  }

  private async startWDA(): Promise<void> {
    // We require WebDriverAgent to be started manually
    await this.checkWDAPreparation();
    debugWDA('WebDriverAgent verification completed');
  }

  private async checkWDAPreparation(): Promise<void> {
    // Check if WebDriverAgent is reachable at the configured API base URL
    if (await this.isWDARunning()) {
      debugWDA('WebDriverAgent is already running');
      return;
    }

    // If not running, throw error with setup instructions
    throw new Error(
      `WebDriverAgent is not reachable at the configured address. Please start WebDriverAgent manually or check the gateway route:

🔧 Setup Instructions:
1. Install WebDriverAgent: npm install appium-webdriveragent
2. Build and run WebDriverAgent:
   - For simulators: Use Xcode to run WebDriverAgentRunner on your target simulator
   - For real devices: Build WebDriverAgentRunner and install on your device
3. Ensure WebDriverAgent is reachable at the configured address

💡 Alternative: You can also specify a different host/port where WebDriverAgent is running.`,
    );
  }

  private async isWDARunning(): Promise<boolean> {
    try {
      const url = `${this.getEndpoint()}/status`;
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
}
