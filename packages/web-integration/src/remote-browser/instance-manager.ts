/**
 * FaaS Instance Manager for GEM Browser
 * Handles creation, deletion, and management of FaaS instances
 */

import { getDebug } from '@midscene/shared/logger';
import {
  API_ENDPOINTS,
  DEFAULT_CONFIG,
  HEADERS,
  TTL_CONSTRAINTS,
} from './constants';
import type {
  CdpEndpointInfo,
  FaaSInstanceCreateOptions,
  FaaSInstanceCreateResponse,
  FaaSInstanceInfo,
  InstanceManagerConfig,
} from './types';
import { FaaSInstanceError } from './types';

const debugRemoteBrowser = getDebug('remote-browser:instance');

/**
 * FaaS Instance Manager
 * Manages lifecycle of GEM Browser FaaS instances
 */
export class FaaSInstanceManager {
  private baseUrl: string;
  private requestTimeout: number;
  private jwtToken?: string;

  constructor(config: InstanceManagerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.requestTimeout =
      config.requestTimeout || DEFAULT_CONFIG.REQUEST_TIMEOUT;
    this.jwtToken = config.jwtToken;
  }

  /**
   * Create a new FaaS instance
   */
  async createInstance(
    options: FaaSInstanceCreateOptions = {},
  ): Promise<FaaSInstanceInfo> {
    const startTime = Date.now();
    const {
      image = '',
      envs = {},
      metadata = {},
      ttlMinutes = DEFAULT_CONFIG.TTL_MINUTES,
      displayWidth,
      displayHeight,
      userAgent,
    } = options;

    debugRemoteBrowser(
      `Creating instance: ttl=${ttlMinutes}m, display=${displayWidth}x${displayHeight}`,
    );

    // Validate TTL
    if (ttlMinutes < TTL_CONSTRAINTS.MIN || ttlMinutes > TTL_CONSTRAINTS.MAX) {
      throw new FaaSInstanceError(
        `TTL must be between ${TTL_CONSTRAINTS.MIN} and ${TTL_CONSTRAINTS.MAX} minutes`,
      );
    }

    // Build environment variables
    const instanceEnvs: Record<string, string> = { ...envs };
    if (displayWidth) {
      instanceEnvs.DISPLAY_WIDTH = String(displayWidth);
    }
    if (displayHeight) {
      instanceEnvs.DISPLAY_HEIGHT = String(displayHeight);
    }
    if (userAgent) {
      instanceEnvs.BROWSER_USER_AGENT = userAgent;
    }

    // Prepare request body
    const body = {
      image,
      envs: instanceEnvs,
      metadata,
      ttl_minutes: ttlMinutes,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout,
      );

      const headers: Record<string, string> = {
        [HEADERS.CREATE_SANDBOX_V2]: 'true',
        'Content-Type': 'application/json',
      };

      if (this.jwtToken) {
        headers.Authorization = `Bearer ${this.jwtToken}`;
      }

      debugRemoteBrowser(
        `Sending create request to ${this.baseUrl}${API_ENDPOINTS.CREATE}`,
      );

      const response = await fetch(this.baseUrl + API_ENDPOINTS.CREATE, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(
          `Failed to create instance: ${response.status} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          `Failed to create instance: ${response.status} ${response.statusText}`,
          'CREATE_FAILED',
          errorText,
        );
      }

      const result: FaaSInstanceCreateResponse = await response.json();

      if (!result.data?.sandbox_id) {
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(
          `Invalid create response: missing sandbox_id (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          'Invalid response: missing sandbox_id',
          'INVALID_RESPONSE',
          result,
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
      const timeCost = Date.now() - startTime;

      debugRemoteBrowser(
        `Instance created: ${result.data.sandbox_id} (${timeCost}ms)`,
      );

      return {
        sandboxId: result.data.sandbox_id,
        createdAt: now,
        expiresAt,
        status: 'running',
      };
    } catch (error: any) {
      const timeCost = Date.now() - startTime;
      if (error.name === 'AbortError') {
        debugRemoteBrowser(`Create instance timeout (${timeCost}ms)`);
        throw new FaaSInstanceError(
          'Request timeout while creating instance',
          'TIMEOUT',
        );
      }
      if (error instanceof FaaSInstanceError) {
        throw error;
      }
      debugRemoteBrowser(
        `Create instance error: ${error.message} (${timeCost}ms)`,
      );
      throw new FaaSInstanceError(
        'Failed to create instance',
        'UNKNOWN_ERROR',
        error,
      );
    }
  }

  /**
   * Delete a FaaS instance
   */
  async deleteInstance(sandboxId: string): Promise<void> {
    const startTime = Date.now();
    debugRemoteBrowser(`Deleting instance: ${sandboxId}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout,
      );

      const headers: Record<string, string> = {
        [HEADERS.DELETE_SANDBOX]: 'true',
        [HEADERS.INSTANCE_NAME]: sandboxId,
      };

      if (this.jwtToken) {
        headers.Authorization = `Bearer ${this.jwtToken}`;
        headers[HEADERS.JWT_TOKEN] = this.jwtToken;
      }

      const response = await fetch(this.baseUrl + API_ENDPOINTS.PING, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // 404 is acceptable - instance may already be deleted
        if (response.status !== 404) {
          const timeCost = Date.now() - startTime;
          debugRemoteBrowser(
            `Failed to delete instance ${sandboxId}: ${response.status} (${timeCost}ms)`,
          );
          throw new FaaSInstanceError(
            `Failed to delete instance: ${response.status} ${response.statusText}`,
            'DELETE_FAILED',
            errorText,
          );
        } else {
          const timeCost = Date.now() - startTime;
          debugRemoteBrowser(
            `Instance ${sandboxId} already deleted (404) (${timeCost}ms)`,
          );
        }
      } else {
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(`Instance deleted: ${sandboxId} (${timeCost}ms)`);
      }
    } catch (error: any) {
      const timeCost = Date.now() - startTime;
      if (error.name === 'AbortError') {
        debugRemoteBrowser(
          `Delete instance timeout: ${sandboxId} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          'Request timeout while deleting instance',
          'TIMEOUT',
        );
      }
      if (error instanceof FaaSInstanceError) {
        throw error;
      }
      debugRemoteBrowser(
        `Delete instance error: ${sandboxId}: ${error.message} (${timeCost}ms)`,
      );
      throw new FaaSInstanceError(
        'Failed to delete instance',
        'UNKNOWN_ERROR',
        error,
      );
    }
  }

  /**
   * Update instance TTL (Time To Live)
   */
  async updateInstanceTTL(
    sandboxId: string,
    ttlMinutes: number,
  ): Promise<void> {
    const startTime = Date.now();
    debugRemoteBrowser(
      `Updating instance TTL: ${sandboxId}, ttl=${ttlMinutes}m`,
    );

    // Validate TTL
    if (ttlMinutes < TTL_CONSTRAINTS.MIN || ttlMinutes > TTL_CONSTRAINTS.MAX) {
      throw new FaaSInstanceError(
        `TTL must be between ${TTL_CONSTRAINTS.MIN} and ${TTL_CONSTRAINTS.MAX} minutes`,
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout,
      );

      const headers: Record<string, string> = {
        [HEADERS.SANDBOX_TTL_MINUTES]: String(ttlMinutes),
        [HEADERS.INSTANCE_NAME]: sandboxId,
      };

      if (this.jwtToken) {
        headers.Authorization = `Bearer ${this.jwtToken}`;
      }

      const response = await fetch(this.baseUrl + API_ENDPOINTS.PING, {
        method: 'PATCH',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(
          `Failed to update TTL for ${sandboxId}: ${response.status} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          `Failed to update instance TTL: ${response.status} ${response.statusText}`,
          'UPDATE_TTL_FAILED',
          errorText,
        );
      }

      const timeCost = Date.now() - startTime;
      debugRemoteBrowser(
        `Instance TTL updated: ${sandboxId}, ttl=${ttlMinutes}m (${timeCost}ms)`,
      );
    } catch (error: any) {
      const timeCost = Date.now() - startTime;
      if (error.name === 'AbortError') {
        debugRemoteBrowser(`Update TTL timeout: ${sandboxId} (${timeCost}ms)`);
        throw new FaaSInstanceError(
          'Request timeout while updating instance TTL',
          'TIMEOUT',
        );
      }
      if (error instanceof FaaSInstanceError) {
        throw error;
      }
      debugRemoteBrowser(
        `Update TTL error: ${sandboxId}: ${error.message} (${timeCost}ms)`,
      );
      throw new FaaSInstanceError(
        'Failed to update instance TTL',
        'UNKNOWN_ERROR',
        error,
      );
    }
  }

  /**
   * Check if instance exists
   */
  async checkInstance(sandboxId: string): Promise<boolean> {
    const startTime = Date.now();
    debugRemoteBrowser(`Checking instance: ${sandboxId}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout,
      );

      const headers: Record<string, string> = {
        [HEADERS.INSTANCE_NAME]: sandboxId,
      };

      if (this.jwtToken) {
        headers.Authorization = `Bearer ${this.jwtToken}`;
      }

      const response = await fetch(this.baseUrl + API_ENDPOINTS.PING, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for instance_not_found error code in headers
      const errorCode = response.headers.get('X-Bytefaas-Response-Error-Code');
      if (errorCode === 'instance_not_found') {
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(`Instance not found: ${sandboxId} (${timeCost}ms)`);
        return false;
      }

      const exists = response.ok;
      const timeCost = Date.now() - startTime;
      debugRemoteBrowser(
        `Instance check: ${sandboxId}, exists=${exists} (${timeCost}ms)`,
      );

      return exists;
    } catch (error: any) {
      const timeCost = Date.now() - startTime;
      if (error.name === 'AbortError') {
        debugRemoteBrowser(
          `Check instance timeout: ${sandboxId} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          'Request timeout while checking instance',
          'TIMEOUT',
        );
      }
      // Assume instance doesn't exist if we can't check
      debugRemoteBrowser(
        `Check instance error: ${sandboxId}: ${error.message}, assuming not found (${timeCost}ms)`,
      );
      return false;
    }
  }

  /**
   * Get CDP endpoint information
   */
  async getCdpEndpoint(sandboxId: string): Promise<CdpEndpointInfo> {
    const startTime = Date.now();
    debugRemoteBrowser(`Getting CDP endpoint for: ${sandboxId}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeout,
      );

      // Use subdomain access (recommended)
      const cdpUrl = `https://${sandboxId}.${this.baseUrl.replace(/^https?:\/\//, '')}${API_ENDPOINTS.CDP_VERSION}`;
      debugRemoteBrowser(`CDP URL: ${cdpUrl}`);

      const headers: Record<string, string> = {};
      if (this.jwtToken) {
        headers.Authorization = `Bearer ${this.jwtToken}`;
      }

      const response = await fetch(cdpUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(
          `Failed to get CDP endpoint for ${sandboxId}: ${response.status} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          `Failed to get CDP endpoint: ${response.status} ${response.statusText}`,
          'CDP_ENDPOINT_FAILED',
          errorText,
        );
      }

      const cdpInfo: CdpEndpointInfo = await response.json();

      if (!cdpInfo.webSocketDebuggerUrl) {
        const timeCost = Date.now() - startTime;
        debugRemoteBrowser(
          `Invalid CDP response for ${sandboxId}: missing webSocketDebuggerUrl (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          'Invalid CDP response: missing webSocketDebuggerUrl',
          'INVALID_CDP_RESPONSE',
          cdpInfo,
        );
      }

      const timeCost = Date.now() - startTime;
      debugRemoteBrowser(
        `CDP endpoint retrieved: ${sandboxId}, ws=${cdpInfo.webSocketDebuggerUrl} (${timeCost}ms)`,
      );

      return cdpInfo;
    } catch (error: any) {
      const timeCost = Date.now() - startTime;
      if (error.name === 'AbortError') {
        debugRemoteBrowser(
          `Get CDP endpoint timeout: ${sandboxId} (${timeCost}ms)`,
        );
        throw new FaaSInstanceError(
          'Request timeout while getting CDP endpoint',
          'TIMEOUT',
        );
      }
      if (error instanceof FaaSInstanceError) {
        throw error;
      }
      debugRemoteBrowser(
        `Get CDP endpoint error: ${sandboxId}: ${error.message} (${timeCost}ms)`,
      );
      throw new FaaSInstanceError(
        'Failed to get CDP endpoint',
        'UNKNOWN_ERROR',
        error,
      );
    }
  }

  /**
   * Build subdomain URL for a given path
   */
  buildSubdomainUrl(sandboxId: string, path: string): string {
    const baseHost = this.baseUrl.replace(/^https?:\/\//, '');
    return `https://${sandboxId}.${baseHost}${path}`;
  }

  /**
   * Get VNC URL for instance
   */
  getVncUrl(sandboxId: string, autoconnect = true): string {
    const vncPath = autoconnect
      ? `${API_ENDPOINTS.VNC}?autoconnect=true`
      : API_ENDPOINTS.VNC;
    return this.buildSubdomainUrl(sandboxId, vncPath);
  }

  /**
   * Get MCP URL for instance
   */
  getMcpUrl(sandboxId: string): string {
    return this.buildSubdomainUrl(sandboxId, API_ENDPOINTS.MCP);
  }
}
