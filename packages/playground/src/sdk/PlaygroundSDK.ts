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

  constructor(config: PlaygroundConfig) {
    this.adapter = this.createAdapter(config.type, config.serverUrl);
  }

  private createAdapter(
    type: string,
    serverUrl?: string,
  ): BasePlaygroundAdapter {
    switch (type) {
      case 'local-execution':
        return new LocalExecutionAdapter();
      case 'remote-execution':
        return new RemoteExecutionAdapter(serverUrl);
      default:
        throw new Error(`Unsupported execution type: ${type}`);
    }
  }

  async executeAction(
    activeAgent: PlaygroundAgent,
    actionType: string,
    actionSpace: DeviceAction<unknown>[],
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    return this.adapter.executeAction(
      activeAgent,
      actionType,
      actionSpace,
      value,
      options,
    );
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
}
