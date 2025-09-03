import { overrideAIConfig } from '@midscene/shared/env';
import { findAllMidsceneLocatorField } from '../../ai-model';
import type { DeviceAction } from '../../types';
import { executeAction } from '../common';
import type { ExecutionOptions, FormValue, PlaygroundAgent } from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent;
  private taskProgressTips: Record<string, string> = {};

  constructor(agent: PlaygroundAgent) {
    super();
    this.agent = agent;
  }

  private cleanup(requestId: string): void {
    delete this.taskProgressTips[requestId];
  }

  async parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]> {
    if (!action?.paramSchema || !('shape' in action.paramSchema)) {
      return [params.prompt || '', options];
    }

    const locatorFieldKeys = findAllMidsceneLocatorField(action.paramSchema);

    // Find locate field (MidsceneLocation field)
    let locateField = null;
    if (locatorFieldKeys.length > 0) {
      locateField = params[locatorFieldKeys[0]];
    }

    // Filter non-locate fields
    const nonLocateFields = this.filterValidParams(params, locatorFieldKeys);

    // Local execution format: [locateField, { ...otherParams, ...options }]
    const paramObj = { ...nonLocateFields, ...options };
    return [locateField, paramObj];
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

  // Local execution gets actionSpace directly from local agent
  async getActionSpace(page: any): Promise<DeviceAction<unknown>[]> {
    return await page.actionSpace();
  }

  // Local execution doesn't use a server, so always return true
  async checkStatus(): Promise<boolean> {
    return true;
  }

  async overrideConfig(aiConfig: any): Promise<void> {
    // For local execution, use the shared env override function
    overrideAIConfig(aiConfig);
  }

  async executeAction(
    actionType: string,
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    // Get actionSpace from the stored agent
    const actionSpace = this.agent.getActionSpace
      ? await this.agent.getActionSpace()
      : [];

    // Setup progress tracking if requestId is provided
    if (options.requestId && this.agent) {
      // Store the original callback if exists
      const originalCallback = this.agent.onTaskStartTip;

      // Override with our callback that stores tips and calls original
      this.agent.onTaskStartTip = (tip: string) => {
        // Store tip for our progress tracking
        this.taskProgressTips[options.requestId!] = tip;
        // Call original callback if it existed
        if (originalCallback && typeof originalCallback === 'function') {
          originalCallback(tip);
        }
      };
    }

    try {
      // Call the base implementation with the original signature
      return await executeAction(
        this.agent,
        actionType,
        actionSpace,
        value,
        options,
      );
    } finally {
      // Always clean up progress tracking to prevent memory leaks
      if (options.requestId) {
        this.cleanup(options.requestId);
      }
    }
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
    } catch (error: any) {
      console.error(`Failed to cancel agent: ${error.message}`);
      return { error: `Failed to cancel: ${error.message}` };
    }
  }
}
