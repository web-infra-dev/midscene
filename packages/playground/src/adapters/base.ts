import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import { executeAction } from '../common';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
} from '../types';

export abstract class BasePlaygroundAdapter {
  abstract parseStructuredParams(
    action: DeviceAction<unknown>,
    params: Record<string, unknown>,
    options: ExecutionOptions,
  ): Promise<unknown[]>;

  abstract formatErrorMessage(error: any): string;

  // Default implementation for execution - delegates to common executeAction
  async executeAction(
    activeAgent: PlaygroundAgent,
    actionType: string,
    actionSpace: DeviceAction<unknown>[],
    value: FormValue,
    options: ExecutionOptions,
  ): Promise<unknown> {
    return executeAction(activeAgent, actionType, actionSpace, value, options);
  }

  // Optional method for getting action space - default implementation returns empty array
  async getActionSpace(_context: any): Promise<DeviceAction<unknown>[]> {
    return [];
  }

  // Common validation logic - can be overridden if needed
  validateParams(
    value: FormValue,
    action: DeviceAction<unknown> | undefined,
  ): ValidationResult {
    if (!value.params) {
      return { valid: false, errorMessage: 'Parameters are required' };
    }

    if (!action?.paramSchema) {
      return { valid: true };
    }

    try {
      // Create a copy of params for validation, converting string locate fields to proper format
      const paramsForValidation = { ...value.params };

      // Find all MidsceneLocation fields in the schema
      const schema = action.paramSchema;
      if (schema) {
        const locatorFieldKeys = findAllMidsceneLocatorField(schema);
        locatorFieldKeys.forEach((key) => {
          // This is a MidsceneLocation field - convert string to object for validation
          if (typeof paramsForValidation[key] === 'string') {
            paramsForValidation[key] = {
              midscene_location_field_flag: true,
              prompt: paramsForValidation[key],
              center: [0, 0], // dummy values for validation
              rect: { left: 0, top: 0, width: 0, height: 0 },
            };
          }
        });
      }

      action.paramSchema?.parse(paramsForValidation);
      return { valid: true };
    } catch (error: unknown) {
      // Extract meaningful error message from Zod validation
      const zodError = error as {
        errors?: Array<{ path: string[]; message: string }>;
      };
      if (zodError.errors && zodError.errors.length > 0) {
        const errorMessages = zodError.errors
          .filter((err) => {
            // Filter out validation errors for dummy MidsceneLocation values
            const path = err.path.join('.');
            return (
              !path.includes('center') &&
              !path.includes('rect') &&
              !path.includes('midscene_location_field_flag')
            );
          })
          .map((err) => {
            const field = err.path.join('.');
            return `${field}: ${err.message}`;
          });

        if (errorMessages.length > 0) {
          return {
            valid: false,
            errorMessage: `Validation error: ${errorMessages.join(', ')}`,
          };
        }
      } else {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown validation error';
        return {
          valid: false,
          errorMessage: `Parameter validation failed: ${errorMsg}`,
        };
      }
    }

    return { valid: true };
  }

  // Common display content creation logic - can be overridden if needed
  createDisplayContent(
    value: FormValue,
    needsStructuredParams: boolean,
    action: DeviceAction<unknown> | undefined,
  ): string {
    if (!needsStructuredParams || !value.params || !action?.paramSchema) {
      return value.prompt || '';
    }

    const paramsList: string[] = [];

    // Dynamically generate display content from actionSpace paramSchema
    const schema = action.paramSchema;
    if (schema && 'shape' in schema) {
      const locatorFieldKeys = findAllMidsceneLocatorField(schema);
      Object.keys((schema as any).shape).forEach((key) => {
        const paramValue = value.params?.[key];
        if (
          paramValue !== undefined &&
          paramValue !== null &&
          paramValue !== ''
        ) {
          // Convert key to display name (capitalize first letter)
          const displayKey = key.charAt(0).toUpperCase() + key.slice(1);

          const isLocateField = locatorFieldKeys.includes(key);

          // Format the value based on field type
          if (isLocateField) {
            paramsList.push(`${displayKey}: "${paramValue}"`);
          } else if (typeof paramValue === 'string') {
            paramsList.push(`${displayKey}: "${paramValue}"`);
          } else if (typeof paramValue === 'number') {
            // Special handling for distance in scroll
            if (key === 'distance') {
              paramsList.push(`${displayKey}: ${paramValue}px`);
            } else {
              paramsList.push(`${displayKey}: ${paramValue}`);
            }
          } else {
            paramsList.push(`${displayKey}: ${paramValue}`);
          }
        }
      });
    }

    return paramsList.join('\n') || value.prompt || '';
  }

  // Helper method for basic error message formatting
  protected formatBasicErrorMessage(error: any): string {
    return error?.message || 'Unknown error';
  }

  // Helper method for parsing structured params base logic
  protected getSchemaKeys(action: DeviceAction<unknown>): string[] {
    if (!action?.paramSchema || !('shape' in action.paramSchema)) {
      return [];
    }

    const schema = action.paramSchema;
    return schema && 'shape' in schema
      ? Object.keys((schema as { shape: Record<string, unknown> }).shape)
      : [];
  }

  // Helper method for filtering valid params
  protected filterValidParams(
    params: Record<string, unknown>,
    excludeKeys: string[] = [],
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};

    Object.keys(params).forEach((key) => {
      if (
        !excludeKeys.includes(key) &&
        params[key] !== undefined &&
        params[key] !== null &&
        params[key] !== ''
      ) {
        filtered[key] = params[key];
      }
    });

    return filtered;
  }
}
