import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import type { ExecutionOptions } from '../types';
import { BasePlaygroundAdapter } from './base';

export class LocalExecutionAdapter extends BasePlaygroundAdapter {
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

  // Uses base implementation for validateParams and createDisplayContent
}
