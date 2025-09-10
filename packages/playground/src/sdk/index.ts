import type { DeviceAction } from '@midscene/core';
import type { BasePlaygroundAdapter } from '../adapters/base';
import { LocalExecutionAdapter } from '../adapters/local-execution';
import { RemoteExecutionAdapter } from '../adapters/remote-execution';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  PlaygroundConfig,
  ValidationResult,
} from '../types';

export class PlaygroundSDK {
  private adapter: BasePlaygroundAdapter;
  private progressCallback?: (tip: string) => void;
  private activePolling = new Map<
    string,
    { interval: NodeJS.Timeout; callback: (tip: string) => void }
  >();

  constructor(config: PlaygroundConfig) {
    this.adapter = this.createAdapter(
      config.type,
      config.serverUrl,
      config.agent,
    );
  }

  private createAdapter(
    type: string,
    serverUrl?: string,
    agent?: PlaygroundAgent,
  ): BasePlaygroundAdapter {
    switch (type) {
      case 'local-execution':
        if (!agent) {
          throw new Error('Agent is required for local execution');
        }
        return new LocalExecutionAdapter(agent);
      case 'remote-execution':
        return new RemoteExecutionAdapter(serverUrl);
      default:
        throw new Error(`Unsupported execution type: ${type}`);
    }
  }

  async executeAction(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    const result = await this.adapter.executeAction(actionType, value, options);

    // Stop any active polling for this request after execution completes
    if (options.requestId) {
      this.stopProgressPolling(options.requestId);
    }

    return result;
  }

  async getActionSpace(context?: unknown): Promise<DeviceAction<unknown>[]> {
    // Both adapters now accept context parameter
    // Local will prioritize internal agent, Remote will use server + fallback
    return this.adapter.getActionSpace(context);
  }

  validateStructuredParams(
    value: FormValue,
    action: DeviceAction<unknown> | undefined,
  ): ValidationResult {
    return this.adapter.validateParams(value, action);
  }

  formatErrorMessage(error: any): string {
    return this.adapter.formatErrorMessage(error);
  }

  createDisplayContent(
    value: FormValue,
    needsStructuredParams: boolean,
    action: DeviceAction<unknown> | undefined,
  ): string {
    return this.adapter.createDisplayContent(
      value,
      needsStructuredParams,
      action,
    );
  }

  // Server communication methods (for remote execution)
  async checkStatus(): Promise<boolean> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.checkStatus();
    }
    return true; // For local execution, always return true
  }

  async overrideConfig(aiConfig: any): Promise<void> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.overrideConfig(aiConfig);
    }
    // For local execution, this is a no-op
  }

  async getTaskProgress(requestId: string): Promise<{ tip?: string }> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.getTaskProgress(requestId);
    }
    if (this.adapter instanceof LocalExecutionAdapter) {
      return this.adapter.getTaskProgress(requestId);
    }
    return { tip: undefined }; // Fallback
  }

  // Cancel task (for remote execution)
  async cancelTask(requestId: string): Promise<any> {
    // Stop progress polling for this request
    this.stopProgressPolling(requestId);

    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.cancelTask(requestId);
    }
    return { error: 'Cancel task not supported in local execution mode' };
  }

  // Progress callback management
  onProgressUpdate(callback: (tip: string) => void): void {
    this.progressCallback = callback;

    // Pass the callback to the adapter if it supports it
    if (this.adapter instanceof RemoteExecutionAdapter) {
      this.adapter.setProgressCallback(callback);
    } else if (this.adapter instanceof LocalExecutionAdapter) {
      this.adapter.setProgressCallback(callback);
    }
  }

  // Start progress polling for remote execution (deprecated - now handled by adapter)
  startProgressPolling(requestId: string): void {
    // This method is now handled by the RemoteExecutionAdapter automatically
    // when executeAction is called with a requestId
    console.warn(
      'startProgressPolling is deprecated - polling is now automatic',
    );
  }

  // Stop progress polling for a specific request (deprecated - now handled by adapter)
  stopProgressPolling(requestId: string): void {
    // This method is now handled by the RemoteExecutionAdapter automatically
    console.warn(
      'stopProgressPolling is deprecated - polling cleanup is now automatic',
    );
  }

  // Cancel execution - supports both remote and local
  async cancelExecution(requestId: string): Promise<void> {
    this.stopProgressPolling(requestId);

    if (this.adapter instanceof RemoteExecutionAdapter) {
      await this.adapter.cancelTask(requestId);
    } else if (this.adapter instanceof LocalExecutionAdapter) {
      // For local execution, we might need to implement agent cancellation
      console.warn('Local execution cancellation not fully implemented');
    }
  }
}
