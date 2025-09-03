import type { DeviceAction } from '../../types';
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
    return this.adapter.executeAction(actionType, value, options);
  }

  async getActionSpace(context: any): Promise<DeviceAction<unknown>[]> {
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
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.cancelTask(requestId);
    }
    return { error: 'Cancel task not supported in local execution mode' };
  }
}
