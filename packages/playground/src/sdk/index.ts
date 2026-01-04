import type { DeviceAction } from '@midscene/core';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import type { BasePlaygroundAdapter } from '../adapters/base';
import { LocalExecutionAdapter } from '../adapters/local-execution';
import { RemoteExecutionAdapter } from '../adapters/remote-execution';
import type {
  AgentFactory,
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
      config.agentFactory,
    );
  }

  private createAdapter(
    type: string,
    serverUrl?: string,
    agent?: PlaygroundAgent,
    agentFactory?: AgentFactory,
  ): BasePlaygroundAdapter {
    switch (type) {
      case 'local-execution':
        if (!agent && !agentFactory) {
          throw new Error(
            'Agent or agentFactory is required for local execution',
          );
        }
        return new LocalExecutionAdapter(agent, agentFactory);
      case 'remote-execution': {
        // Use provided serverUrl first, then fallback to localhost if current page origin is file:// or default
        const finalServerUrl =
          serverUrl ||
          (typeof window !== 'undefined' &&
          window.location.protocol.includes('http')
            ? window.location.origin
            : `http://localhost:${PLAYGROUND_SERVER_PORT}`);

        return new RemoteExecutionAdapter(finalServerUrl);
      }
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

  // Get adapter ID (works for both remote and local execution)
  get id(): string | undefined {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.id;
    }
    if (this.adapter instanceof LocalExecutionAdapter) {
      return this.adapter.id;
    }
    return undefined;
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

  // Get task progress (for remote execution)
  async getTaskProgress(requestId: string): Promise<{ executionDump?: any }> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.getTaskProgress(requestId);
    }
    // For local execution, progress is handled via onDumpUpdate callback
    return {};
  }

  // Cancel task (for remote execution)
  async cancelTask(requestId: string): Promise<any> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.cancelTask(requestId);
    }
    return { error: 'Cancel task not supported in local execution mode' };
  }

  // Dump update callback management
  onDumpUpdate(callback: (dump: string, executionDump?: any) => void): void {
    if (this.adapter instanceof LocalExecutionAdapter) {
      this.adapter.onDumpUpdate(callback);
    } else if (this.adapter instanceof RemoteExecutionAdapter) {
      this.adapter.onDumpUpdate(callback);
    }
  }

  // Progress update callback management
  onProgressUpdate(callback: (tip: string) => void): void {
    if (this.adapter instanceof LocalExecutionAdapter) {
      this.adapter.setProgressCallback(callback);
    }
    // RemoteExecutionAdapter uses polling mechanism via onDumpUpdate, no separate progress callback needed
  }

  // Cancel execution - supports both remote and local
  async cancelExecution(requestId: string): Promise<{
    dump: any | null;
    reportHTML: string | null;
  } | null> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      const result = await this.adapter.cancelTask(requestId);
      // Return dump and reportHTML if available from cancellation
      if (result.success) {
        return {
          dump: (result as any).dump || null,
          reportHTML: (result as any).reportHTML || null,
        };
      }
    } else if (this.adapter instanceof LocalExecutionAdapter) {
      // Invoke adapter cancellation to destroy the agent and block further actions
      const result = await this.adapter.cancelTask(requestId);
      if (result.success) {
        return {
          dump: (result as any).dump || null,
          reportHTML: (result as any).reportHTML || null,
        };
      }
    }
    return null;
  }

  // Get current execution data (dump and report)
  async getCurrentExecutionData(): Promise<{
    dump: any | null;
    reportHTML: string | null;
  }> {
    if (
      this.adapter instanceof LocalExecutionAdapter &&
      this.adapter.getCurrentExecutionData
    ) {
      return await this.adapter.getCurrentExecutionData();
    }
    // For remote execution or if method not available, return empty data
    return { dump: null, reportHTML: null };
  }

  // Screenshot method for remote execution
  async getScreenshot(): Promise<{
    screenshot: string;
    timestamp: number;
  } | null> {
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.getScreenshot();
    }
    return null; // For local execution, not supported yet
  }

  // Get interface information (type and description)
  async getInterfaceInfo(): Promise<{
    type: string;
    description?: string;
  } | null> {
    if (this.adapter instanceof LocalExecutionAdapter) {
      return this.adapter.getInterfaceInfo();
    }
    if (this.adapter instanceof RemoteExecutionAdapter) {
      return this.adapter.getInterfaceInfo();
    }
    return null;
  }

  // Get service mode based on adapter type
  getServiceMode(): 'In-Browser-Extension' | 'Server' {
    if (this.adapter instanceof LocalExecutionAdapter) {
      return 'In-Browser-Extension';
    }
    return 'Server';
  }
}
