import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import { overrideAIConfig } from '@midscene/shared/env';
import { executeAction } from '../common';
import type { ExecutionOptions, FormValue, PlaygroundAgent } from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
  private agent: PlaygroundAgent;
  private taskProgressTips: Record<string, string> = {};
  private progressCallback?: (tip: string) => void;

  constructor(agent: PlaygroundAgent) {
    super();
    this.agent = agent;
  }

  setProgressCallback(callback: (tip: string) => void): void {
    this.progressCallback = callback;
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
  async getActionSpace(context?: any): Promise<DeviceAction<unknown>[]> {
    // For local execution, we get actionSpace from the stored agent
    if (this.agent && this.agent.getActionSpace) {
      return await this.agent.getActionSpace();
    }
    
    // Fallback: try to get actionSpace from agent's interface (page)
    if (this.agent && (this.agent as any).interface) {
      const page = (this.agent as any).interface;
      if (page && page.actionSpace) {
        return await page.actionSpace();
      }
    }
    
    // If context is provided and has actionSpace method, use it
    if (context && context.actionSpace) {
      return await context.actionSpace();
    }
    
    console.warn('No actionSpace method available in LocalExecutionAdapter');
    return [];
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
    // Get actionSpace using the same logic as getActionSpace method
    let actionSpace: any[] = [];
    
    if (this.agent && this.agent.getActionSpace) {
      actionSpace = await this.agent.getActionSpace();
    } else if (this.agent && (this.agent as any).interface) {
      const page = (this.agent as any).interface;
      if (page && page.actionSpace) {
        actionSpace = await page.actionSpace();
      }
    }

    // Setup progress tracking if requestId is provided
    if (options.requestId && this.agent) {
      // Store the original callback if exists (this preserves chrome extension callbacks)
      const originalCallback = this.agent.onTaskStartTip;

      // Override with our callback that stores tips and calls original
      this.agent.onTaskStartTip = (tip: string) => {
        // Store tip for our progress tracking
        this.taskProgressTips[options.requestId!] = tip;
        
        // Call the direct progress callback set via setProgressCallback
        if (this.progressCallback) {
          this.progressCallback(tip);
        }
        
        // Call original callback if it existed (this will call chrome extension callbacks)
        if (originalCallback && typeof originalCallback === 'function') {
          originalCallback(tip);
        }
      };
    }

    try {
      // Call the base implementation with the original signature
      const result = await executeAction(
        this.agent,
        actionType,
        actionSpace,
        value,
        options,
      );

      // For local execution, we need to package the result with dump and reportHTML
      // similar to how the server does it
      const response = {
        result,
        dump: null as any,
        reportHTML: null as string | null,
        error: null as string | null,
      };

      try {
        // Get dump and reportHTML from agent like the server does
        if (this.agent.dumpDataString) {
          const dumpString = this.agent.dumpDataString();
          if (dumpString) {
            response.dump = JSON.parse(dumpString);
          }
        }

        if (this.agent.reportHTMLString) {
          response.reportHTML = this.agent.reportHTMLString() || null;
        }

        // Write out action dumps
        if (this.agent.writeOutActionDumps) {
          this.agent.writeOutActionDumps();
        }
      } catch (error: any) {
        console.error('Failed to get dump/reportHTML from agent:', error);
      }

      return response;
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
