import type { DeviceAction } from '@midscene/core';
import type { ExecutionOptions, FormValue, PlaygroundAgent } from '../types';
import { BasePlaygroundAdapter } from './base';

export class RemoteExecutionAdapter extends BasePlaygroundAdapter {
  private serverUrl?: string;

  constructor(serverUrl?: string) {
    super();
    this.serverUrl = serverUrl;
  }
  async parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]> {
    if (!action?.paramSchema || !('shape' in action.paramSchema)) {
      return [params.prompt || '', options];
    }

    // Filter all valid params and merge with options
    const validParams = this.filterValidParams(params);
    const paramObj: Record<string, unknown> = { ...options, ...validParams };

    // Remote execution format: [paramObj]
    return [paramObj];
  }

  formatErrorMessage(error: any): string {
    // Handle Android-specific errors
    if (error.message?.includes('adb')) {
      return 'ADB connection error. Please ensure device is connected and USB debugging is enabled.';
    }
    if (error.message?.includes('UIAutomator')) {
      return 'UIAutomator error. Please ensure the UIAutomator server is running on the device.';
    }

    return this.formatBasicErrorMessage(error);
  }

  // Remote execution adapter can use server for execution when serverUrl is provided
  async executeAction(
    activeAgent: PlaygroundAgent,
    actionType: string,
    actionSpace: DeviceAction<unknown>[],
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    // If serverUrl is provided, use server-side execution
    if (this.serverUrl && typeof window !== 'undefined') {
      return this.executeViaServer(actionType, value, options);
    }

    // Otherwise use default local execution
    return super.executeAction(
      activeAgent,
      actionType,
      actionSpace,
      value,
      options,
    );
  }

  // Remote execution via server
  private async executeViaServer(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    const response = await fetch(`${this.serverUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: actionType,
        prompt: value.prompt,
        params: value.params,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server request failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }

    return result.result;
  }

  // Get action space from server
  async getActionSpace(context: any): Promise<DeviceAction<unknown>[]> {
    if (this.serverUrl && typeof window !== 'undefined') {
      const response = await fetch(`${this.serverUrl}/action-space`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get action space: ${response.statusText}`);
      }

      return await response.json();
    }

    // Fallback to local implementation (if page object available)
    if (context && typeof context.actionSpace === 'function') {
      return await context.actionSpace();
    }

    return [];
  }

  // Uses base implementation for validateParams and createDisplayContent
}
