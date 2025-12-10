import type { DeviceAction, ExecutionDump } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { executeAction, parseStructuredParams } from '../common';
import type { ExecutionOptions, FormValue, PlaygroundAgent } from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent;
  private dumpUpdateCallback?: (
    dump: string,
    executionDump?: ExecutionDump,
  ) => void;
  private readonly _id: string; // Unique identifier for this local adapter instance
  private currentRequestId?: string; // Track current request to prevent stale callbacks

  constructor(agent: PlaygroundAgent) {
    super();
    this.agent = agent;
    this._id = uuid(); // Generate unique ID for local adapter
  }

  // Get adapter ID
  get id(): string {
    return this._id;
  }

  onDumpUpdate(
    callback: (dump: string, executionDump?: ExecutionDump) => void,
  ): void {
    // Clear any existing callback before setting new one
    this.dumpUpdateCallback = undefined;
    // Set the new callback
    this.dumpUpdateCallback = callback;
  }

  async parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]> {
    // Use shared implementation from common.ts
    return await parseStructuredParams(action, params, options);
  }

  formatErrorMessage(error: any): string {
    const errorMessage = error?.message || '';
    if (errorMessage.includes('of different extension')) {
      return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
    }
    return this.formatBasicErrorMessage(error);
  }

  // Local execution - use base implementation
  // (inherits default executeAction from BasePlaygroundAdapter)

  // Local execution gets actionSpace from internal agent (parameter is for backward compatibility)
  async getActionSpace(context?: unknown): Promise<DeviceAction<unknown>[]> {
    // Priority 1: Use agent's getActionSpace method
    if (this.agent?.getActionSpace) {
      return await this.agent.getActionSpace();
    }

    // Priority 2: Use agent's interface.actionSpace method
    if (
      this.agent &&
      'interface' in this.agent &&
      typeof this.agent.interface === 'object'
    ) {
      const page = this.agent.interface as {
        actionSpace?: () => DeviceAction<unknown>[];
      };
      if (page?.actionSpace) {
        return page.actionSpace();
      }
    }

    // Priority 3: Fallback to context parameter (for backward compatibility with tests)
    if (context && typeof context === 'object' && 'actionSpace' in context) {
      const contextPage = context as {
        actionSpace: () => DeviceAction<unknown>[];
      };
      return contextPage.actionSpace();
    }

    return [];
  }

  // Local execution doesn't use a server, so always return true
  async checkStatus(): Promise<boolean> {
    return true;
  }

  async overrideConfig(aiConfig: Record<string, unknown>): Promise<void> {
    // For local execution, use the shared env override function
    overrideAIConfig(aiConfig);
  }

  /**
   * Safely detaches the Chrome debugger without destroying the agent.
   * This removes the "Debugger attached" banner from the browser window
   * while keeping the agent instance intact for potential reuse.
   * Called on errors to improve user experience by cleaning up the UI.
   */
  private async detachDebuggerSafely() {
    try {
      const page = this.agent?.interface as
        | { detachDebugger?: () => Promise<void> }
        | undefined;
      await page?.detachDebugger?.();
    } catch (error) {
      console.warn('Failed to detach debugger:', error);
    }
  }

  async executeAction(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    // Get actionSpace using our simplified getActionSpace method
    const actionSpace = await this.getActionSpace();
    let originalOnDumpUpdate:
      | ((dump: string, executionDump?: ExecutionDump) => void)
      | undefined;

    // Setup dump update tracking if requestId is provided
    if (options.requestId && this.agent) {
      // Track current request ID to prevent stale callbacks
      this.currentRequestId = options.requestId;

      // Intercept Agent's onDumpUpdate to forward executionDump
      originalOnDumpUpdate = this.agent.onDumpUpdate;
      this.agent.onDumpUpdate = (
        dump: string,
        executionDump?: ExecutionDump,
      ) => {
        // Only process if this is still the current request
        if (this.currentRequestId !== options.requestId) {
          return;
        }

        // Forward to external callback
        if (this.dumpUpdateCallback) {
          this.dumpUpdateCallback(dump, executionDump);
        }

        // Call original callback
        if (typeof originalOnDumpUpdate === 'function') {
          originalOnDumpUpdate(dump, executionDump);
        }
      };
    }

    try {
      // Call the base implementation with the original signature
      const result = await executeAction(
        this.agent,
        actionType,
        actionSpace,
        value,
        options,
      );

      // For local execution, we need to package the result with dump and reportHTML
      // similar to how the server does it
      const response = {
        result,
        dump: null as unknown,
        reportHTML: null as string | null,
        error: null as string | null,
      };

      try {
        if (this.agent.dumpDataString) {
          const dumpString = this.agent.dumpDataString();
          if (dumpString) {
            const groupedDump = JSON.parse(dumpString);
            response.dump = groupedDump.executions?.[0] || null;
          }
        }

        if (this.agent.reportHTMLString) {
          response.reportHTML = this.agent.reportHTMLString() || null;
        }

        // Write out action dumps
        if (this.agent.writeOutActionDumps) {
          this.agent.writeOutActionDumps();
        }
      } catch (error: unknown) {
        console.error('Failed to get dump/reportHTML from agent:', error);
      }

      return response;
    } finally {
      // Always reset dump to clear execution history
      try {
        this.agent.resetDump();
      } catch (error: unknown) {
        console.error('Failed to reset dump:', error);
      }

      // Always clean up callbacks to prevent accumulation
      if (options.requestId && this.agent) {
        this.agent.onDumpUpdate = originalOnDumpUpdate;
      }
    }
  }

  // Local execution task cancellation - minimal implementation
  async cancelTask(
    _requestId: string,
  ): Promise<{ error?: string; success?: boolean }> {
    if (!this.agent) {
      return { error: 'No active agent found for this requestId' };
    }

    try {
      await this.agent.destroy?.();
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to cancel agent: ${errorMessage}`);
      return { error: `Failed to cancel: ${errorMessage}` };
    }
  }

  // Get interface information from the agent
  async getInterfaceInfo(): Promise<{
    type: string;
    description?: string;
  } | null> {
    if (!this.agent?.interface) {
      return null;
    }

    try {
      const type = this.agent.interface.interfaceType || 'Unknown';
      const description = this.agent.interface.describe?.() || undefined;

      return {
        type,
        description,
      };
    } catch (error: unknown) {
      console.error('Failed to get interface info:', error);
      return null;
    }
  }
}
