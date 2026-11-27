import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { normalizeWebDriverBaseUrl } from '../utils/base-url';
import { WebDriverRequestError, makeWebDriverRequest } from '../utils/request';
import type {
  DeviceInfo,
  Size,
  WDASession,
  WebDriverOptions,
  WebDriverRequestOptions,
} from './types';

const debugClient = getDebug('webdriver:client');

export class WebDriverClient {
  protected baseUrl: string;
  protected sessionId: string | null = null;
  protected ownsSession = false;
  protected port: number;
  protected host: string;
  protected timeout: number;

  constructor(options: WebDriverOptions = {}) {
    this.port = options.port || DEFAULT_WDA_PORT;
    this.host = options.host || 'localhost';
    this.timeout = options.timeout || 30000;
    this.baseUrl =
      options.baseUrl !== undefined
        ? normalizeWebDriverBaseUrl(options.baseUrl)
        : `http://${this.host}:${this.port}`;
    this.sessionId = options.sessionId || null;
    this.ownsSession = !options.sessionId;

    debugClient('Initialized WebDriver client');
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
      this.ownsSession = true;

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

    if (!this.ownsSession) {
      debugClient(`Detached external session: ${this.sessionId}`);
      this.sessionId = null;
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

    const base = `/session/${this.sessionId}/window`;
    const response = await this.makeRequest('GET', `${base}/rect`).catch(
      (error) => {
        if (
          !(
            error instanceof WebDriverRequestError && error.isUnsupportedCommand
          )
        ) {
          throw error;
        }
        return this.makeRequest('GET', `${base}/size`);
      },
    );
    const { width, height } = response.value ?? response;
    if (
      ![width, height].every((value) => Number.isFinite(value) && value > 0)
    ) {
      throw new Error('WebDriver returned an invalid window size');
    }
    return { width, height };
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
    options?: WebDriverRequestOptions,
  ): Promise<any> {
    return makeWebDriverRequest(
      this.baseUrl,
      method,
      endpoint,
      data,
      options?.timeout ?? this.timeout,
    );
  }

  /**
   * Build a session-scoped endpoint path.
   * If the endpoint already starts with `/session/`, return as-is;
   * otherwise prepend `/session/${sessionId}`.
   */
  protected buildSessionEndpoint(endpoint: string): string {
    this.ensureSession();
    if (endpoint.startsWith('/session/')) {
      return endpoint;
    }
    return `/session/${this.sessionId}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  protected ensureSession(): void {
    if (!this.sessionId) {
      throw new Error(
        'No active WebDriver session. Call createSession() first.',
      );
    }
  }
}
