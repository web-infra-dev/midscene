/**
 * Remote Browser Agent
 * Factory for creating PuppeteerAgent or PlaywrightAgent connected to GEM Browser
 */

import { getDebug } from '@midscene/shared/logger';
import { PlaywrightAgent } from '../playwright';
import { PuppeteerAgent } from '../puppeteer';
import {
  DEFAULT_CONFIG,
  GEM_BROWSER_ENVIRONMENTS,
  GEM_BROWSER_PLAYWRIGHT_ENVIRONMENTS,
} from './constants';
import { FaaSInstanceManager } from './instance-manager';
import { RemoteBrowserPage } from './page';
import type {
  FaaSInstanceInfo,
  RemoteBrowserOptions,
  VncOptions,
} from './types';
import { RemoteBrowserError } from './types';

const debug = getDebug('remote-browser:agent');

/**
 * Internal options with required fields
 */
interface InternalRemoteBrowserOptions extends RemoteBrowserOptions {
  environment: 'CN' | 'I18N' | 'BOE' | 'VOLCANO';
  baseUrl: string;
  engine: 'puppeteer' | 'playwright';
  ttlMinutes: number;
  displayWidth: number;
  displayHeight: number;
  autoCleanup: boolean;
  requestTimeout: number;
  connectionTimeout: number;
  faasEnvs: Record<string, string>;
  faasMetadata: Record<string, string>;
}

/**
 * Remote Browser Agent with management methods
 */
export type RemoteBrowserAgent = (PuppeteerAgent | PlaywrightAgent) & {
  // FaaS instance management methods
  getSandboxId(): string;
  getVncUrl(options?: VncOptions): string;
  getMcpUrl(): string;
  getInstanceInfo(): FaaSInstanceInfo | null;
  updateTTL(ttlMinutes: number): Promise<void>;
  isInstanceRunning(): Promise<boolean>;
  getRemotePage(): RemoteBrowserPage;

  // Cleanup (enhanced to also delete FaaS instance)
  cleanup(): Promise<void>;

  // Internal state
  _remoteBrowserState: {
    instanceManager: FaaSInstanceManager;
    remotePage: RemoteBrowserPage;
    instanceInfo: FaaSInstanceInfo;
    options: InternalRemoteBrowserOptions;
  };
};

/**
 * Launch a remote browser agent
 */
export async function launchRemoteBrowser(
  options: RemoteBrowserOptions = {},
): Promise<RemoteBrowserAgent> {
  // Set default options
  const internalOptions: InternalRemoteBrowserOptions = {
    environment: options.environment || 'CN',
    baseUrl: options.baseUrl || '',
    engine: options.engine || 'puppeteer',
    ttlMinutes: options.ttlMinutes || DEFAULT_CONFIG.TTL_MINUTES,
    displayWidth: options.displayWidth || DEFAULT_CONFIG.DISPLAY_WIDTH,
    displayHeight: options.displayHeight || DEFAULT_CONFIG.DISPLAY_HEIGHT,
    userAgent: options.userAgent,
    autoCleanup: options.autoCleanup ?? true,
    requestTimeout: options.requestTimeout || DEFAULT_CONFIG.REQUEST_TIMEOUT,
    connectionTimeout:
      options.connectionTimeout || DEFAULT_CONFIG.CONNECTION_TIMEOUT,
    sandboxId: options.sandboxId,
    faasEnvs: options.faasEnvs || {},
    faasMetadata: options.faasMetadata || {},
    jwtToken: options.jwtToken,
    ...options,
  };

  // Determine base URL
  if (!internalOptions.baseUrl) {
    if (internalOptions.engine === 'playwright') {
      // Playwright environments (no VOLCANO support)
      if (internalOptions.environment === 'VOLCANO') {
        throw new RemoteBrowserError(
          'Playwright engine does not support VOLCANO environment. Use puppeteer or specify a custom baseUrl.',
          'UNSUPPORTED_ENVIRONMENT',
        );
      }
      internalOptions.baseUrl =
        GEM_BROWSER_PLAYWRIGHT_ENVIRONMENTS[internalOptions.environment];
    } else {
      // Puppeteer environments (all supported)
      internalOptions.baseUrl =
        GEM_BROWSER_ENVIRONMENTS[internalOptions.environment];
    }
  }

  // Initialize instance manager
  const instanceManager = new FaaSInstanceManager({
    baseUrl: internalOptions.baseUrl,
    requestTimeout: internalOptions.requestTimeout,
    jwtToken: internalOptions.jwtToken,
  });

  debug('Creating remote browser with options:', {
    environment: internalOptions.environment,
    baseUrl: internalOptions.baseUrl,
    engine: internalOptions.engine,
    ttlMinutes: internalOptions.ttlMinutes,
  });

  let instanceInfo: FaaSInstanceInfo | undefined;
  let remotePage: RemoteBrowserPage;

  try {
    // Step 1: Create or connect to FaaS instance
    if (internalOptions.sandboxId) {
      debug('Connecting to existing sandbox:', internalOptions.sandboxId);
      // Check if the instance exists
      const exists = await instanceManager.checkInstance(
        internalOptions.sandboxId,
      );
      if (!exists) {
        throw new RemoteBrowserError(
          `Sandbox ${internalOptions.sandboxId} does not exist`,
          'SANDBOX_NOT_FOUND',
        );
      }
      instanceInfo = {
        sandboxId: internalOptions.sandboxId,
        status: 'running',
      };
    } else {
      debug('Creating new FaaS instance...');
      instanceInfo = await instanceManager.createInstance({
        ttlMinutes: internalOptions.ttlMinutes,
        displayWidth: internalOptions.displayWidth,
        displayHeight: internalOptions.displayHeight,
        userAgent: internalOptions.userAgent,
        envs: internalOptions.faasEnvs,
        metadata: internalOptions.faasMetadata,
      });
      debug('FaaS instance created:', instanceInfo.sandboxId);
    }

    // Step 2: Get CDP endpoint
    debug('Getting CDP endpoint...');
    const cdpInfo = await instanceManager.getCdpEndpoint(
      instanceInfo.sandboxId,
    );
    debug('CDP WebSocket URL:', cdpInfo.webSocketDebuggerUrl);

    // Step 3: Create RemoteBrowserPage and connect
    debug('Connecting to remote browser via CDP...');
    remotePage = new RemoteBrowserPage(
      instanceInfo.sandboxId,
      cdpInfo.webSocketDebuggerUrl,
      internalOptions.engine,
      instanceManager,
    );

    await remotePage.connect(internalOptions);
    debug('Connected to remote browser');

    // Step 4: Create PuppeteerAgent or PlaywrightAgent
    const page = remotePage.getPage();
    let agent: PuppeteerAgent | PlaywrightAgent;

    if (internalOptions.engine === 'puppeteer') {
      agent = new PuppeteerAgent(page as any, internalOptions);
    } else {
      agent = new PlaywrightAgent(page as any, internalOptions);
    }

    debug('RemoteBrowserAgent created successfully');

    // Step 5: Add remote browser management methods to the agent
    const remoteBrowserAgent = agent as RemoteBrowserAgent;

    // Store internal state
    remoteBrowserAgent._remoteBrowserState = {
      instanceManager,
      remotePage,
      instanceInfo,
      options: internalOptions,
    };

    // Add management methods
    remoteBrowserAgent.getSandboxId = function () {
      return this._remoteBrowserState.instanceInfo.sandboxId;
    };

    remoteBrowserAgent.getVncUrl = function (vncOptions?: VncOptions) {
      return this._remoteBrowserState.remotePage.getVncUrl(vncOptions);
    };

    remoteBrowserAgent.getMcpUrl = function () {
      return this._remoteBrowserState.instanceManager.getMcpUrl(
        this._remoteBrowserState.instanceInfo.sandboxId,
      );
    };

    remoteBrowserAgent.getInstanceInfo = function () {
      return this._remoteBrowserState.instanceInfo;
    };

    remoteBrowserAgent.updateTTL = async function (ttlMinutes: number) {
      await this._remoteBrowserState.instanceManager.updateInstanceTTL(
        this._remoteBrowserState.instanceInfo.sandboxId,
        ttlMinutes,
      );
      debug('Instance TTL updated to', ttlMinutes, 'minutes');
    };

    remoteBrowserAgent.isInstanceRunning = async function () {
      return await this._remoteBrowserState.instanceManager.checkInstance(
        this._remoteBrowserState.instanceInfo.sandboxId,
      );
    };

    remoteBrowserAgent.getRemotePage = function () {
      return this._remoteBrowserState.remotePage;
    };

    // Override cleanup to also handle FaaS instance
    const originalDestroy = agent.destroy.bind(agent);
    remoteBrowserAgent.cleanup = async function () {
      debug('Cleaning up RemoteBrowserAgent...');

      // Call original destroy
      await originalDestroy();

      // Close CDP connection
      if (this._remoteBrowserState.remotePage) {
        await this._remoteBrowserState.remotePage.cleanup();
      }

      // Delete FaaS instance if auto-cleanup is enabled and we created it
      if (
        this._remoteBrowserState.options.autoCleanup &&
        !this._remoteBrowserState.options.sandboxId
      ) {
        try {
          debug(
            'Deleting FaaS instance:',
            this._remoteBrowserState.instanceInfo.sandboxId,
          );
          await this._remoteBrowserState.instanceManager.deleteInstance(
            this._remoteBrowserState.instanceInfo.sandboxId,
          );
          debug('FaaS instance deleted');
        } catch (error) {
          console.warn('Failed to delete FaaS instance:', error);
        }
      }

      debug('Cleanup completed');
    };

    // Also override destroy to call cleanup
    remoteBrowserAgent.destroy = remoteBrowserAgent.cleanup;

    return remoteBrowserAgent;
  } catch (error: any) {
    debug('Failed to launch RemoteBrowserAgent:', error);
    // Cleanup if creation failed
    if (
      instanceInfo &&
      !internalOptions.sandboxId &&
      internalOptions.autoCleanup
    ) {
      try {
        await instanceManager.deleteInstance(instanceInfo.sandboxId);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
