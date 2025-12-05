import type { DeviceAction } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { executeAction, parseStructuredParams } from '../common';
import type { ExecutionOptions, FormValue, PlaygroundAgent } from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent;
  private taskProgressTips: Record<string, string> = {};
  private progressCallback?: (tip: string) => void;
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

  setProgressCallback(callback: (tip: string) => void): void {
    // Clear any existing callback before setting new one
    this.progressCallback = undefined;
    // Set the new callback
    this.progressCallback = callback;
  }

  private cleanup(requestId: string): void {
    delete this.taskProgressTips[requestId];
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
        actionSpace?: () => Promise<DeviceAction<unknown>[]>;
      };
      if (page?.actionSpace) {
        return await page.actionSpace();
      }
    }

    // Priority 3: Fallback to context parameter (for backward compatibility with tests)
    if (context && typeof context === 'object' && 'actionSpace' in context) {
      const contextPage = context as {
        actionSpace: () => Promise<DeviceAction<unknown>[]>;
      };
      return await contextPage.actionSpace();
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

  // Helper to extract dump and reportHTML from agent
  private extractAgentData() {
    const data = {
      dump: null as unknown,
      reportHTML: null as string | null,
    };

    try {
      if (this.agent.dumpDataString) {
        const dumpString = this.agent.dumpDataString();
        if (dumpString) {
          data.dump = JSON.parse(dumpString);
        }
      }

      if (this.agent.reportHTMLString) {
        data.reportHTML = this.agent.reportHTMLString() || null;
      }
    } catch (error) {
      console.error('Failed to extract dump/reportHTML from agent:', error);
    }

    return data;
  }

  // Helper to detach debugger without destroying the agent
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
    let originalOnTaskStartTip: ((tip: string) => void) | undefined;
    let originalOnDumpUpdate: ((dump: string) => void) | undefined;

    // Setup progress tracking if requestId is provided
    if (options.requestId && this.agent) {
      // Track current request ID to prevent stale callbacks
      this.currentRequestId = options.requestId;
      originalOnTaskStartTip = this.agent.onTaskStartTip;
      originalOnDumpUpdate = this.agent.onDumpUpdate;

      // Set up a fresh callback for task start tips
      this.agent.onTaskStartTip = (tip: string) => {
        // Only process if this is still the current request
        if (this.currentRequestId !== options.requestId) {
          return;
        }

        // Store tip for our progress tracking
        this.taskProgressTips[options.requestId!] = tip;

        // Call the direct progress callback set via setProgressCallback
        if (this.progressCallback) {
          this.progressCallback(tip);
        }

        if (typeof originalOnTaskStartTip === 'function') {
          originalOnTaskStartTip(tip);
        }
      };

      // Set up real-time dump update callback
      this.agent.onDumpUpdate = (dumpString: string) => {
        // Only process if this is still the current request
        if (this.currentRequestId !== options.requestId) {
          return;
        }

        try {
          const dump = JSON.parse(dumpString);
          // Send task status updates via progress callback using special format
          if (dump?.executions?.[0]?.tasks) {
            const tasks = dump.executions[0].tasks;
            for (const task of tasks) {
              if (task.status === 'failed' && task.errorMessage) {
                // Send task failure notification with format: "taskType|failed|errorMessage"
                const taskType = task.subType || task.type;
                const statusUpdate = `${taskType}|failed|${task.errorMessage}`;
                if (this.progressCallback) {
                  this.progressCallback(statusUpdate);
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to parse dump in onDumpUpdate:', error);
        }

        if (typeof originalOnDumpUpdate === 'function') {
          originalOnDumpUpdate(dumpString);
        }
      };
    }

    let executionError: Error | null = null;
    let result: unknown = null;

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
      executionError =
        error instanceof Error
          ? error
          : new Error(`Execution failed: ${error}`);
      // Detach debugger on error to remove the banner
      await this.detachDebuggerSafely();
    } finally {
      // Always clean up progress tracking
      if (options.requestId) {
        this.cleanup(options.requestId);
        if (this.agent) {
          this.agent.onTaskStartTip = originalOnTaskStartTip;
          this.agent.onDumpUpdate = originalOnDumpUpdate;
        }
      }
    }

    // Extract dump and reportHTML (works for both success and error cases)
    const { dump, reportHTML } = this.extractAgentData();

    // Write out action dumps on success
    if (!executionError && this.agent.writeOutActionDumps) {
      try {
        this.agent.writeOutActionDumps();
      } catch (error) {
        console.warn('Failed to write action dumps:', error);
      }
    }

    // Reset dump
    try {
      this.agent.resetDump?.();
    } catch (error) {
      console.warn('Failed to reset dump:', error);
    }

    // If there was an error, throw it after cleanup
    if (executionError) {
      throw executionError;
    }

    // Return response in consistent format for success case
    return {
      result,
      dump,
      reportHTML,
      error: null,
    };
  }

  async getTaskProgress(requestId: string): Promise<{ tip?: string }> {
    // Return the stored tip for this requestId
    return { tip: this.taskProgressTips[requestId] || undefined };
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
