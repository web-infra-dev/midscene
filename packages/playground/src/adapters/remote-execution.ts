import type { DeviceAction } from '@midscene/core';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import type { ExecutionOptions, FormValue } from '../types';
import { BasePlaygroundAdapter } from './base';

export class RemoteExecutionAdapter extends BasePlaygroundAdapter {
  private serverUrl?: string;

  constructor(serverUrl = `http://localhost:${PLAYGROUND_SERVER_PORT}`) {
    super();
    this.serverUrl = serverUrl;
  }
  async parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]> {
    if (!this.hasValidSchema(action)) {
      return [params.prompt || '', options];
    }

    // Remote execution format: merge options and valid params into a single object
    return [{ ...options, ...this.filterValidParams(params) }];
  }

  formatErrorMessage(error: any): string {
    const message = error?.message || '';

    // Handle Android-specific errors
    const androidErrors = [
      {
        keyword: 'adb',
        message:
          'ADB connection error. Please ensure device is connected and USB debugging is enabled.',
      },
      {
        keyword: 'UIAutomator',
        message:
          'UIAutomator error. Please ensure the UIAutomator server is running on the device.',
      },
    ];

    const androidError = androidErrors.find(({ keyword }) =>
      message.includes(keyword),
    );
    if (androidError) {
      return androidError.message;
    }

    return this.formatBasicErrorMessage(error);
  }

  // Remote execution adapter - simplified interface
  async executeAction(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    // If serverUrl is provided, use server-side execution
    if (this.serverUrl && typeof window !== 'undefined') {
      return this.executeViaServer(actionType, value, options);
    }

    throw new Error(
      'Remote execution adapter requires server URL for execution',
    );
  }

  // Remote execution via server - uses same endpoint as requestPlaygroundServer
  private async executeViaServer(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    const payload: Record<string, unknown> = {
      context: options.context,
      type: actionType,
      prompt: value.prompt,
      ...this.buildOptionalPayloadParams(options, value),
    };

    try {
      const response = await fetch(`${this.serverUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Server request failed (${response.status}): ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      console.error('Execute via server failed:', error);
      throw error;
    }
  }

  // Helper method to build optional payload parameters
  private buildOptionalPayloadParams(
    options: ExecutionOptions,
    value: FormValue,
  ): Record<string, unknown> {
    const optionalParams: Record<string, unknown> = {};

    // Add optional parameters only if they have meaningful values
    const optionalFields = [
      { key: 'requestId', value: options.requestId },
      { key: 'deepThink', value: options.deepThink },
      { key: 'screenshotIncluded', value: options.screenshotIncluded },
      { key: 'domIncluded', value: options.domIncluded },
      { key: 'params', value: value.params },
    ] as const;

    optionalFields.forEach(({ key, value }) => {
      if (value !== undefined && value !== null && value !== '') {
        optionalParams[key] = value;
      }
    });

    return optionalParams;
  }

  // Helper method to check if action has a valid schema
  private hasValidSchema(action: DeviceAction<unknown>): boolean {
    return !!(action?.paramSchema && 'shape' in action.paramSchema);
  }

  // Get action space from server
  async getActionSpace(context: any): Promise<DeviceAction<unknown>[]> {
    if (this.serverUrl && typeof window !== 'undefined') {
      try {
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

        const result = await response.json();
        return Array.isArray(result) ? result : [];
      } catch (error) {
        console.error('Failed to get action space from server:', error);
        // Fall through to local implementation
      }
    }

    // Fallback to local implementation (if page object available)
    if (context && typeof context.actionSpace === 'function') {
      try {
        const result = await context.actionSpace();
        return Array.isArray(result) ? result : [];
      } catch (error) {
        console.error('Failed to get action space from context:', error);
      }
    }

    return [];
  }

  // Uses base implementation for validateParams and createDisplayContent

  // Server communication methods
  async checkStatus(): Promise<boolean> {
    if (!this.serverUrl) {
      return false;
    }

    try {
      const res = await fetch(`${this.serverUrl}/status`);
      return res.status === 200;
    } catch (error) {
      console.warn('Server status check failed:', error);
      return false;
    }
  }

  async overrideConfig(aiConfig: any): Promise<void> {
    if (!this.serverUrl) {
      throw new Error('Server URL not configured');
    }

    try {
      const response = await fetch(`${this.serverUrl}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aiConfig }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to override server config: ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error('Failed to override server config:', error);
      throw error;
    }
  }

  async getTaskProgress(requestId: string): Promise<{ tip?: string }> {
    if (!this.serverUrl) {
      return { tip: undefined };
    }

    if (!requestId?.trim()) {
      console.warn('Invalid requestId provided for task progress');
      return { tip: undefined };
    }

    try {
      const response = await fetch(
        `${this.serverUrl}/task-progress/${encodeURIComponent(requestId)}`,
      );

      if (!response.ok) {
        console.warn(`Task progress request failed: ${response.statusText}`);
        return { tip: undefined };
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to poll task progress:', error);
      return { tip: undefined };
    }
  }

  // Cancel task
  async cancelTask(
    requestId: string,
  ): Promise<{ error?: string; success?: boolean }> {
    if (!this.serverUrl) {
      return { error: 'No server URL configured' };
    }

    if (!requestId?.trim()) {
      return { error: 'Invalid request ID' };
    }

    try {
      const res = await fetch(
        `${this.serverUrl}/cancel/${encodeURIComponent(requestId)}`,
      );

      if (!res.ok) {
        return { error: `Cancel request failed: ${res.statusText}` };
      }

      const result = await res.json();
      return { success: true, ...result };
    } catch (error) {
      console.error('Failed to cancel task:', error);
      return { error: 'Failed to cancel task' };
    }
  }
}
