import type { DeviceAction } from '@midscene/core';
import type { ExecutionOptions, FormValue, ValidationResult } from '../types';
import { BasePlaygroundAdapter } from './base';

export class RemoteExecutionAdapter extends BasePlaygroundAdapter {
  private serverUrl?: string;
  private progressPolling = new Map<string, NodeJS.Timeout>();
  private progressCallback?: (tip: string) => void;

  constructor(serverUrl: string) {
    super();
    this.serverUrl = serverUrl;
  }

  // Override validateParams for remote execution
  // Since schemas from server are JSON-serialized and lack .parse() method
  validateParams(
    value: FormValue,
    action: DeviceAction<unknown> | undefined,
  ): ValidationResult {
    if (!action?.paramSchema) {
      return { valid: true };
    }

    const needsStructuredParams = this.actionNeedsStructuredParams(action);

    if (!needsStructuredParams) {
      return { valid: true };
    }

    if (!value.params) {
      return { valid: false, errorMessage: 'Parameters are required' };
    }

    // For remote execution, perform basic validation without .parse()
    // Check if required fields are present
    if (action.paramSchema && typeof action.paramSchema === 'object') {
      const schema = action.paramSchema as any;
      if (schema.shape || schema.type === 'ZodObject') {
        const shape = schema.shape || {};
        const missingFields = Object.keys(shape).filter((key) => {
          const fieldDef = shape[key];
          // Check if field is required (not optional)
          const isOptional =
            fieldDef?.isOptional ||
            fieldDef?._def?.innerType || // ZodOptional
            fieldDef?._def?.typeName === 'ZodOptional';
          return (
            !isOptional &&
            (value.params![key] === undefined || value.params![key] === '')
          );
        });

        if (missingFields.length > 0) {
          return {
            valid: false,
            errorMessage: `Missing required parameters: ${missingFields.join(', ')}`,
          };
        }
      }
    }

    return { valid: true };
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
      type: actionType,
      prompt: value.prompt,
      ...this.buildOptionalPayloadParams(options, value),
    };

    // Add context only if it exists (server can handle single agent case without context)
    if (options.context) {
      payload.context = options.context;
    }

    // Start progress polling if callback is set and requestId exists
    if (options.requestId && this.progressCallback) {
      this.startProgressPolling(options.requestId, this.progressCallback);
    }

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

      const result = await response.json();

      // Stop progress polling when execution completes
      if (options.requestId) {
        this.stopProgressPolling(options.requestId);
      }

      return result;
    } catch (error) {
      // Stop progress polling on error
      if (options.requestId) {
        this.stopProgressPolling(options.requestId);
      }
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

  // Get action space from server with fallback
  async getActionSpace(context?: unknown): Promise<DeviceAction<unknown>[]> {
    // Try server first if available
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
        // Fall through to context fallback
      }
    }

    // Fallback: try context.actionSpace if available
    if (context && typeof context === 'object' && 'actionSpace' in context) {
      try {
        const actionSpaceMethod = (
          context as { actionSpace: () => Promise<DeviceAction<unknown>[]> }
        ).actionSpace;
        const result = await actionSpaceMethod();
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

  async overrideConfig(aiConfig: Record<string, unknown>): Promise<void> {
    if (!this.serverUrl) {
      throw new Error('Server URL not configured');
    }

    // Map visualizer config keys to environment variable names
    const mappedConfig: Record<string, unknown> = {};

    // Map visualizer config keys to their corresponding environment variable names
    const configKeyMapping: Record<string, string> = {
      deepThink: 'MIDSCENE_FORCE_DEEP_THINK',
      // screenshotIncluded and domIncluded are execution options, not global config
      // They will be passed through ExecutionOptions in executeAction

      // Most config keys are already in the correct environment variable format
      // so we don't need to map them. The frontend stores config as OPENAI_API_KEY, etc.
    };

    // Convert visualizer config to environment variable format
    Object.entries(aiConfig).forEach(([key, value]) => {
      if (key === 'screenshotIncluded' || key === 'domIncluded') {
        // These are execution options, not global config - skip them here
        return;
      }

      const mappedKey = configKeyMapping[key] || key;
      // Environment variables must be strings - convert all values to strings
      mappedConfig[mappedKey] = String(value);
    });

    try {
      const response = await fetch(`${this.serverUrl}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aiConfig: mappedConfig }),
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
    // Stop progress polling
    this.stopProgressPolling(requestId);

    if (!this.serverUrl) {
      return { error: 'No server URL configured' };
    }

    if (!requestId?.trim()) {
      return { error: 'Invalid request ID' };
    }

    try {
      const res = await fetch(
        `${this.serverUrl}/cancel/${encodeURIComponent(requestId)}`,
        {
          method: 'POST',
        },
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

  // Progress callback management
  setProgressCallback(callback: (tip: string) => void): void {
    this.progressCallback = callback;
  }

  // Start progress polling
  private startProgressPolling(
    requestId: string,
    callback: (tip: string) => void,
  ): void {
    // Don't start multiple polling for the same request
    if (this.progressPolling.has(requestId)) {
      return;
    }

    let lastTip = '';
    const interval = setInterval(async () => {
      try {
        const progress = await this.getTaskProgress(requestId);
        if (progress?.tip?.trim?.() && progress.tip !== lastTip) {
          lastTip = progress.tip;
          callback(progress.tip);
        }
      } catch (error) {
        // Silently ignore progress polling errors to avoid spam
        console.debug('Progress polling error:', error);
      }
    }, 500); // Poll every 500ms

    this.progressPolling.set(requestId, interval);
  }

  // Stop progress polling
  private stopProgressPolling(requestId: string): void {
    const interval = this.progressPolling.get(requestId);
    if (interval) {
      clearInterval(interval);
      this.progressPolling.delete(requestId);
    }
  }

  // Get screenshot from server
  async getScreenshot(): Promise<{
    screenshot: string;
    timestamp: number;
  } | null> {
    if (!this.serverUrl) {
      return null;
    }

    try {
      const response = await fetch(`${this.serverUrl}/screenshot`);

      if (!response.ok) {
        console.warn(`Screenshot request failed: ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get screenshot:', error);
      return null;
    }
  }
}
