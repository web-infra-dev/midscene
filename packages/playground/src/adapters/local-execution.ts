import type {
  AgentExecutionEventPayload,
  DeviceAction,
  ExecutionDump,
  IExecutionDump,
  SerializedDumpObject,
} from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { executeAction, parseStructuredParams } from '../common';
import type {
  AgentFactory,
  ExecutionData,
  ExecutionEventCallback,
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  SnapshotUpdateCallback,
} from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent | null;
  private agentFactory?: AgentFactory; // Factory function for recreating agent
  private dumpUpdateCallback?: (
    dump: string,
    executionDump?: ExecutionDump,
  ) => void;
  private executionEventCallback?: ExecutionEventCallback;
  private snapshotUpdateCallback?: SnapshotUpdateCallback;
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

  onExecutionEvent(callback: ExecutionEventCallback): void {
    this.executionEventCallback = undefined;
    this.executionEventCallback = callback;
  }

  onSnapshotUpdate(callback: SnapshotUpdateCallback): void {
    this.snapshotUpdateCallback = undefined;
    this.snapshotUpdateCallback = callback;
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
    // If agent doesn't exist but we have a factory, create one temporarily to get actionSpace
    if (!this.agent && this.agentFactory) {
      try {
        this.agent = await this.agentFactory();
      } catch (error) {
        console.warn('Failed to create agent for actionSpace:', error);
        return [];
      }
    }

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

  private readSnapshot(): SerializedDumpObject | null {
    if (typeof this.agent?.getExecutionSnapshot === 'function') {
      return this.agent.getExecutionSnapshot();
    }

    if (typeof this.agent?.dumpDataString === 'function') {
      const dumpString = this.agent.dumpDataString();
      if (!dumpString) {
        return null;
      }

      return JSON.parse(dumpString) as SerializedDumpObject;
    }

    return null;
  }

  private readLiveExecutionDump(): ExecutionDump | IExecutionDump | null {
    const liveExecutionDump = this.agent?.dump?.executions?.[0];
    if (liveExecutionDump) {
      return liveExecutionDump;
    }

    const snapshot = this.readSnapshot();
    const executions = snapshot?.executions;
    return Array.isArray(executions)
      ? ((executions[0] as IExecutionDump | undefined) ?? null)
      : null;
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
    let removeDumpUpdateListener: (() => void) | undefined;
    let removeExecutionEventListener: (() => void) | undefined;

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

      if (this.dumpUpdateCallback) {
        removeDumpUpdateListener = agent.addDumpUpdateListener(
          (dump: string, executionDump?: ExecutionDump) => {
            if (this.currentRequestId !== options.requestId) {
              return;
            }

            this.dumpUpdateCallback?.(dump, executionDump);
          },
        );
      }

      if (
        (this.executionEventCallback || this.snapshotUpdateCallback) &&
        agent.addExecutionEventListener
      ) {
        removeExecutionEventListener = agent.addExecutionEventListener(
          (payload: AgentExecutionEventPayload) => {
            if (this.currentRequestId !== options.requestId) {
              return;
            }

            this.executionEventCallback?.(payload);
            this.snapshotUpdateCallback?.(payload.getSnapshot());
          },
        );
      }
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

      const response: {
        result: unknown;
        dump: ExecutionDump | IExecutionDump | null;
        snapshot: SerializedDumpObject | null;
        reportHTML: string | null;
        error: string | null;
      } = {
        result,
        dump: null,
        snapshot: null,
        reportHTML: null as string | null,
        error: executionError
          ? executionError instanceof Error
            ? executionError.message
            : String(executionError)
          : null,
      };

      // Return the live execution dump for replay and a compact snapshot for JSON listeners.
      try {
        response.dump = this.readLiveExecutionDump();
        response.snapshot = this.readSnapshot();
      } catch (error: unknown) {
        console.warn('Failed to get dump from agent:', error);
      }

      // Don't throw the error - return it in response so caller can access dump/snapshot.
      // The caller (usePlaygroundExecution) will check response.error to determine success
      return response;
    } finally {
      removeDumpUpdateListener?.();
      removeExecutionEventListener?.();
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
    dump?: ExecutionData['dump'];
    snapshot?: SerializedDumpObject | null;
    reportHTML?: string | null;
  }> {
    if (!this.agent) {
      return { error: 'No active agent found for this requestId' };
    }

    // Get execution data BEFORE destroying the agent
    let dump: ExecutionDump | IExecutionDump | null = null;
    let snapshot: SerializedDumpObject | null = null;
    const reportHTML: string | null = null;

    try {
      dump = this.readLiveExecutionDump();
      snapshot = this.readSnapshot();
    } catch (error) {
      console.warn(
        '[LocalExecutionAdapter] Failed to get dump data before cancel:',
        error,
      );
    }

    try {
      await this.agent.destroy?.();
      this.agent = null; // Clear agent reference
      return { success: true, dump, snapshot, reportHTML };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[LocalExecutionAdapter] Failed to cancel agent: ${errorMessage}`,
      );
      return {
        error: `Failed to cancel: ${errorMessage}`,
        dump,
        snapshot,
        reportHTML,
      };
    }
  }

  /**
   * Get current execution data without resetting
   * This allows retrieving dump and report when execution is stopped
   */
  async getCurrentExecutionData(): Promise<ExecutionData> {
    const response: ExecutionData = {
      dump: null,
      snapshot: null,
      reportHTML: null as string | null,
    };

    try {
      response.dump = this.readLiveExecutionDump();
      response.snapshot = this.readSnapshot();
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
