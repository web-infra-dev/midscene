import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { makeWebDriverRequest } from '../utils/request';
import type { DeviceInfo, Size, WDASession, WebDriverOptions } from './types';

const debugClient = getDebug('webdriver:client');

export class WebDriverClient {
  protected baseUrl: string;
  protected sessionId: string | null = null;
  protected port: number;
  protected host: string;
  protected timeout: number;

  constructor(options: WebDriverOptions = {}) {
    this.port = options.port || DEFAULT_WDA_PORT;
    this.host = options.host || 'localhost';
    this.timeout = options.timeout || 30000;
    this.baseUrl = `http://${this.host}:${this.port}`;

    debugClient(`Initialized WebDriver client on ${this.host}:${this.port}`);
  }

  get sessionInfo(): WDASession | null {
    if (!this.sessionId) {
      return null;
    }
    return {
      sessionId: this.sessionId,
      capabilities: {}, // Will be populated when session is created
    };
  }

  // === Session Management ===

  async createSession(capabilities?: any): Promise<WDASession> {
    try {
      const response = await this.makeRequest('POST', '/session', {
        capabilities: {
          alwaysMatch: {
            ...capabilities,
          },
        },
      });

      this.sessionId = response.sessionId || response.value?.sessionId;

      if (!this.sessionId) {
        throw new Error('Failed to get session ID from response');
      }

      debugClient(`Created session: ${this.sessionId}`);

      return {
        sessionId: this.sessionId,
        capabilities:
          response.capabilities || response.value?.capabilities || {},
      };
    } catch (error) {
      debugClient(`Failed to create session: ${error}`);
      throw error;
    }
  }

  async deleteSession(): Promise<void> {
    if (!this.sessionId) {
      debugClient('No active session to delete');
      return;
    }

    try {
      await this.makeRequest('DELETE', `/session/${this.sessionId}`);
      debugClient(`Deleted session: ${this.sessionId}`);
      this.sessionId = null;
    } catch (error) {
      debugClient(`Failed to delete session: ${error}`);
      // Don't throw, cleanup should be best-effort
      this.sessionId = null;
    }
  }

  // === Standard WebDriver Operations ===

  async takeScreenshot(): Promise<string> {
    this.ensureSession();

    const response = await this.makeRequest(
      'GET',
      `/session/${this.sessionId}/screenshot`,
    );
    return response.value || response;
  }

  async getWindowSize(): Promise<Size> {
    this.ensureSession();

    const response = await this.makeRequest(
      'GET',
      `/session/${this.sessionId}/window/rect`,
    );
    const rect = response.value || response;

    return {
      width: rect.width,
      height: rect.height,
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo | null> {
    try {
      // Try to get device info from status endpoint first
      const statusResponse = await this.makeRequest('GET', '/status');
      if (statusResponse?.device) {
        return {
          udid:
            statusResponse.device.udid ||
            statusResponse.device.identifier ||
            '',
          name: statusResponse.device.name || '',
          model:
            statusResponse.device.model ||
            statusResponse.device.productName ||
            '',
        };
      }
      return null;
    } catch (error) {
      debugClient(`Failed to get device info: ${error}`);
      return null;
    }
  }

  // === Utility Methods ===

  protected async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
  ): Promise<any> {
    return makeWebDriverRequest(
      this.baseUrl,
      method,
      endpoint,
      data,
      this.timeout,
    );
  }

  protected ensureSession(): void {
    if (!this.sessionId) {
      throw new Error(
        'No active WebDriver session. Call createSession() first.',
      );
    }
  }
}
