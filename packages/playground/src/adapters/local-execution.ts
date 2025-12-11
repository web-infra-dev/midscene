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
    let removeListener: (() => void) | undefined;

    // Reset dump at the start of execution to ensure clean state
    try {
      this.agent.resetDump?.();
    } catch (error: unknown) {
      console.warn('Failed to reset dump before execution:', error);
    }

    // Setup dump update tracking if requestId is provided
    if (options.requestId && this.agent) {
      // Track current request ID to prevent stale callbacks
      this.currentRequestId = options.requestId;

      // Add listener and save remove function
      removeListener = this.agent.addDumpUpdateListener(
        (dump: string, executionDump?: ExecutionDump) => {
          // Only process if this is still the current request
          if (this.currentRequestId !== options.requestId) {
            return;
          }

          // Forward to external callback
          if (this.dumpUpdateCallback) {
            this.dumpUpdateCallback(dump, executionDump);
          }
        },
      );
    }

    try {
      let result = null;
      let executionError = null;

      try {
        // Call the base implementation with the original signature
        result = await executeAction(
          this.agent,
          actionType,
          actionSpace,
          value,
          options,
        );
      } catch (error: unknown) {
        // Capture error but don't throw yet - we need to get dump/reportHTML first
        executionError = error;
      }

      // Always construct response with dump and reportHTML, regardless of success/failure
      const response = {
        result,
        dump: null as unknown,
        reportHTML: null as string | null,
        error: executionError
          ? executionError instanceof Error
            ? executionError.message
            : String(executionError)
          : null,
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

      // Don't throw the error - return it in response so caller can access dump/reportHTML
      // The caller (usePlaygroundExecution) will check response.error to determine success
      return response;
    } finally {
      // Remove listener to prevent accumulation
      if (removeListener) {
        removeListener();
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

  /**
   * Get current execution data without resetting
   * This allows retrieving dump and report when execution is stopped
   */
  async getCurrentExecutionData(): Promise<{
    dump: ExecutionDump | null;
    reportHTML: string | null;
  }> {
    const response = {
      dump: null as ExecutionDump | null,
      reportHTML: null as string | null,
    };

    try {
      // Get dump data
      if (this.agent.dumpDataString) {
        const dumpString = this.agent.dumpDataString();
        if (dumpString) {
          const groupedDump = JSON.parse(dumpString);
          response.dump = groupedDump.executions?.[0] || null;
        }
      }

      // Get report HTML
      if (this.agent.reportHTMLString) {
        response.reportHTML = this.agent.reportHTMLString() || null;
      }
    } catch (error: unknown) {
      console.error('Failed to get current execution data:', error);
    }

    return response;
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
