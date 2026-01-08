import type { DeviceAction, ExecutionDump } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { executeAction, parseStructuredParams } from '../common';
import type {
  AgentFactory,
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
} from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent | null;
  private agentFactory?: AgentFactory; // Factory function for recreating agent
  private dumpUpdateCallback?: (
    dump: string,
    executionDump?: ExecutionDump,
  ) => void;
  private progressCallback?: (tip: string) => void;
  private readonly _id: string; // Unique identifier for this local adapter instance
  private currentRequestId?: string; // Track current request to prevent stale callbacks

  constructor(agent?: PlaygroundAgent, agentFactory?: AgentFactory) {
    super();
    this.agent = agent ?? null;
    this.agentFactory = agentFactory;
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

  // Set progress callback for monitoring operation status
  setProgressCallback(callback: (tip: string) => void): void {
    this.progressCallback = undefined;
    this.progressCallback = callback;
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
    console.log('Config updated. Agent will be recreated on next execution.');
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
    // If agentFactory is provided, always recreate agent with latest config before execution
    if (this.agentFactory) {
      if (this.agent) {
        console.log('Destroying old agent before execution...');
        try {
          await this.agent.destroy?.();
        } catch (error) {
          console.warn('Failed to destroy old agent:', error);
        }
        this.agent = null;
      }

      // Create new agent with latest config
      await this.recreateAgent();
    }

    // Agent must exist (either recreated or provided in constructor)
    if (!this.agent) {
      throw new Error(
        'No agent available. Please provide either an agent instance or agentFactory.',
      );
    }

    const agent = this.agent;

    // Get actionSpace using our simplified getActionSpace method
    const actionSpace = await this.getActionSpace();
    let removeListener: (() => void) | undefined;

    // Reset dump at the start of execution to ensure clean state
    try {
      agent.resetDump?.();
    } catch (error: unknown) {
      console.warn('Failed to reset dump before execution:', error);
    }

    // Setup dump update tracking if requestId is provided
    if (options.requestId) {
      // Track current request ID to prevent stale callbacks
      this.currentRequestId = options.requestId;

      // Add listener and save remove function
      removeListener = agent.addDumpUpdateListener(
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
          agent,
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

      // Get dump data - separate try-catch to ensure dump is retrieved even if reportHTML fails
      try {
        if (agent.dumpDataString) {
          const dumpString = agent.dumpDataString();
          if (dumpString) {
            const groupedDump = JSON.parse(dumpString);
            response.dump = groupedDump.executions?.[0] || null;
          }
        }
      } catch (error: unknown) {
        console.warn('Failed to get dump from agent:', error);
      }

      // Try to get reportHTML - may fail in browser environment (fs not available)
      try {
        if (agent.reportHTMLString) {
          response.reportHTML = agent.reportHTMLString() || null;
        }
      } catch (error: unknown) {
        // reportHTMLString may throw in browser environment
        // This is expected in chrome-extension, continue without reportHTML
      }

      // Write out action dumps - may also fail in browser environment
      try {
        if (agent.writeOutActionDumps) {
          agent.writeOutActionDumps();
        }
      } catch (error: unknown) {
        // writeOutActionDumps may fail in browser environment
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

  /**
   * Recreate agent instance using the factory function.
   * Called automatically when executeAction is called.
   */
  private async recreateAgent(): Promise<void> {
    if (!this.agentFactory) {
      throw new Error(
        'Cannot recreate agent: factory function not provided. Please provide agentFactory in PlaygroundConfig to enable agent recreation.',
      );
    }

    console.log('Creating new agent with latest config...');
    try {
      this.agent = await this.agentFactory();
      console.log('Agent created successfully');
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  }

  // Local execution task cancellation - returns dump and reportHTML before destroying
  async cancelTask(_requestId: string): Promise<{
    error?: string;
    success?: boolean;
    dump?: ExecutionDump | null;
    reportHTML?: string | null;
  }> {
    if (!this.agent) {
      return { error: 'No active agent found for this requestId' };
    }

    // Get execution data BEFORE destroying the agent
    let dump: ExecutionDump | null = null;
    let reportHTML: string | null = null;

    // Get dump data separately - don't let reportHTML errors affect dump retrieval
    // IMPORTANT: Must extract dump BEFORE agent.destroy(), as dump is stored in agent memory
    try {
      if (typeof this.agent.dumpDataString === 'function') {
        const dumpString = this.agent.dumpDataString();
        if (dumpString) {
          // dumpDataString() returns GroupedActionDump: { executions: ExecutionDump[] }
          // In Playground, each "Run" creates one execution, so we take executions[0]
          const groupedDump = JSON.parse(dumpString);
          dump = groupedDump.executions?.[0] ?? null;
        }
      }
    } catch (error) {
      console.warn(
        '[LocalExecutionAdapter] Failed to get dump data before cancel:',
        error,
      );
    }

    // Try to get reportHTML separately - this may fail in browser environment
    // where fs.readFileSync is not available
    try {
      if (typeof this.agent.reportHTMLString === 'function') {
        const html = this.agent.reportHTMLString();
        if (
          html &&
          typeof html === 'string' &&
          !html.includes('REPLACE_ME_WITH_REPORT_HTML')
        ) {
          reportHTML = html;
        }
      }
    } catch (error) {
      // reportHTMLString may throw in browser environment (fs not available)
      // This is expected, just continue with dump data only
      console.warn(
        '[LocalExecutionAdapter] reportHTMLString not available in this environment',
      );
    }

    try {
      await this.agent.destroy?.();
      this.agent = null; // Clear agent reference
      return { success: true, dump, reportHTML };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[LocalExecutionAdapter] Failed to cancel agent: ${errorMessage}`,
      );
      return { error: `Failed to cancel: ${errorMessage}`, dump, reportHTML };
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
      if (this.agent?.dumpDataString) {
        const dumpString = this.agent.dumpDataString();
        if (dumpString) {
          const groupedDump = JSON.parse(dumpString);
          response.dump = groupedDump.executions?.[0] || null;
        }
      }

      // Get report HTML
      if (this.agent?.reportHTMLString) {
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
