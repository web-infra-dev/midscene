import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import { dataExtractionAPIs } from '@midscene/playground';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
} from '@midscene/playground';

export const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  // Always return the actual error message, including NOT_IMPLEMENTED_AS_DESIGNED errors
  return errorMessage || 'Unknown error';
};

// Validate form parameters for structured params
export function validateStructuredParams(
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

// Create display content for user input based on actionSpace
export function createDisplayContent(
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

// Execute action using actionSpace method or fallback to traditional methods
export async function executeAction(
  activeAgent: PlaygroundAgent,
  actionType: string,
  actionSpace: DeviceAction<unknown>[],
  value: FormValue,
  options: ExecutionOptions & {
    screenshotIncluded?: boolean;
    domIncluded?: boolean | 'visible-only';
  },
): Promise<unknown> {
  const { deepThink, screenshotIncluded, domIncluded } = options;
  const action = actionSpace?.find(
    (a: DeviceAction<unknown>) =>
      a.interfaceAlias === actionType || a.name === actionType,
  );

  // Try to use actionSpace method first
  if (action && typeof activeAgent.callActionInActionSpace === 'function') {
    if (value.params) {
      // Use structured parameters
      const paramObj: Record<string, any> = {
        deepThink,
        screenshotIncluded,
        domIncluded,
      };
      for (const key in value.params) {
        if (Object.prototype.hasOwnProperty.call(value.params, key)) {
          const element = value.params[key];
          if (element !== undefined && element !== null && element !== '') {
            paramObj[key] = element;
          }
        }
      }
      return await activeAgent.callActionInActionSpace(action.name, paramObj);
    } else {
      // Fallback to legacy prompt parsing
      return await activeAgent.callActionInActionSpace(action.name, {
        prompt: value.prompt,
        deepThink,
        screenshotIncluded,
        domIncluded,
      });
    }
  } else {
    // Fallback to traditional method calls for non-actionSpace methods
    const prompt = value.prompt;

    // special handle for assert method
    if (actionType === 'aiAssert') {
      const { pass, thought } =
        (await activeAgent?.aiAssert?.(prompt || '', undefined, {
          keepRawResponse: true,
          screenshotIncluded,
          domIncluded,
        })) || {};
      return { pass, thought };
    }

    // Fallback for methods not found in actionSpace
    if (activeAgent && typeof activeAgent[actionType] === 'function') {
      const callOptions: Record<string, unknown> = { deepThink };

      if (dataExtractionAPIs.includes(actionType)) {
        if (screenshotIncluded !== undefined) {
          callOptions.screenshotIncluded = screenshotIncluded;
        }
        if (domIncluded !== undefined) {
          callOptions.domIncluded = domIncluded;
        }
      }

      const methodFunc = activeAgent[actionType] as (
        prompt: string,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      return await methodFunc.call(activeAgent, prompt || '', callOptions);
    }

    throw new Error(`Unknown action type: ${actionType}`);
  }
}
