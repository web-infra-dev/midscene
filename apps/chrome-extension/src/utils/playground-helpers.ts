import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import { dataExtractionAPIs } from '@midscene/web/playground';

export const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  // Always return the actual error message, including NOT_IMPLEMENTED_AS_DESIGNED errors
  return errorMessage || 'Unknown error';
};

// Dynamic parameter parsing function based on actionSpace
export async function parseStructuredParams(
  action: DeviceAction<any>,
  params: Record<string, any>,
  options: {
    deepThink?: boolean;
    screenshotIncluded?: boolean;
    domIncluded?: boolean | 'visible-only';
  } = {},
): Promise<any[]> {
  if (!action?.paramSchema || !('shape' in action.paramSchema)) {
    return [params.prompt || '', options];
  }

  const schema = action.paramSchema as any; // ZodObject type
  const keys = Object.keys(schema.shape);
  const locatorFieldKeys = findAllMidsceneLocatorField(schema);

  // Find locate field (MidsceneLocation field)
  let locateField = null;
  const nonLocateFields: Record<string, unknown> = {};

  // The original code implicitly uses the last one if multiple exist.
  // We will use the first locator field found.
  if (locatorFieldKeys.length > 0) {
    locateField = params[locatorFieldKeys[0]];
  }

  keys.forEach((key) => {
    if (
      !locatorFieldKeys.includes(key) &&
      params[key] !== undefined &&
      params[key] !== null &&
      params[key] !== ''
    ) {
      nonLocateFields[key] = params[key];
    }
  });

  // Build the parameters array based on the pattern used in the methods
  // Most methods follow: [locate, { ...otherParams, ...options }]
  const paramObj = { ...nonLocateFields, ...options };

  return [locateField, paramObj];
}

// Validate form parameters for structured params
export function validateStructuredParams(
  value: any,
  action: DeviceAction<any> | undefined,
): { valid: boolean; errorMessage?: string } {
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
  value: any,
  needsStructuredParams: boolean,
  action: DeviceAction<any> | undefined,
): string {
  if (!needsStructuredParams || !value.params || !action?.paramSchema) {
    return value.prompt || '';
  }

  const paramsList: string[] = [];

  // Dynamically generate display content from actionSpace paramSchema
  const schema = action.paramSchema;
  if (schema && 'shape' in schema) {
    const zodSchema = schema as any; // ZodObject type
    const locatorFieldKeys = findAllMidsceneLocatorField(schema);
    Object.keys(zodSchema.shape).forEach((key) => {
      const paramValue = value.params[key];
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
  activeAgent: any,
  actionType: string,
  actionSpace: DeviceAction<any>[],
  value: any,
  deepThink: boolean,
  screenshotIncluded?: boolean,
  domIncluded?: boolean | 'visible-only',
): Promise<any> {
  const action = actionSpace?.find(
    (a: DeviceAction<any>) =>
      a.interfaceAlias === actionType || a.name === actionType,
  );

  // Try to use actionSpace method first
  if (action && typeof activeAgent.callActionInActionSpace === 'function') {
    if (value.params) {
      // Use structured parameters - dynamically parse from actionSpace
      const parsedParams = await parseStructuredParams(action, value.params, {
        deepThink,
        screenshotIncluded,
        domIncluded,
      });
      return await activeAgent.callActionInActionSpace(
        action.name,
        parsedParams[0],
      );
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
        (await activeAgent?.aiAssert(prompt, undefined, {
          keepRawResponse: true,
          screenshotIncluded,
          domIncluded,
        })) || {};
      return { pass, thought };
    }

    // Fallback for methods not found in actionSpace
    if (activeAgent && typeof activeAgent[actionType] === 'function') {
      const callOptions: any = { deepThink };

      if (dataExtractionAPIs.includes(actionType)) {
        if (screenshotIncluded !== undefined) {
          callOptions.screenshotIncluded = screenshotIncluded;
        }
        if (domIncluded !== undefined) {
          callOptions.domIncluded = domIncluded;
        }
      }

      return await activeAgent[actionType](prompt, callOptions);
    }

    throw new Error(`Unknown action type: ${actionType}`);
  }
}
