import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '@midscene/shared/common';

export const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  // Always return the actual error message, including NOT_IMPLEMENTED_AS_DESIGNED errors
  return errorMessage || 'Unknown error';
};

// Parse structured parameters for callActionInActionSpace
async function parseStructuredParams(
  action: DeviceAction<any>,
  params: Record<string, any>,
  options: { deepThink?: boolean } = {},
): Promise<any[]> {
  if (!action?.paramSchema || !('shape' in action.paramSchema)) {
    return [params.prompt || '', options];
  }

  const schema = action.paramSchema as any;
  const keys = Object.keys(schema.shape);

  const paramObj: Record<string, unknown> = { ...options };

  keys.forEach((key) => {
    if (
      params[key] !== undefined &&
      params[key] !== null &&
      params[key] !== ''
    ) {
      paramObj[key] = params[key];
    }
  });

  return [paramObj];
}

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
    const paramsForValidation = { ...value.params };

    const schema = action.paramSchema;
    if (schema) {
      const locatorFieldKeys = findAllMidsceneLocatorField(schema);
      locatorFieldKeys.forEach((key) => {
        if (typeof paramsForValidation[key] === 'string') {
          paramsForValidation[key] = {
            midscene_location_field_flag: true,
            prompt: paramsForValidation[key],
            center: [0, 0],
            rect: { left: 0, top: 0, width: 0, height: 0 },
          };
        }
      });
    }

    action.paramSchema?.parse(paramsForValidation);
    return { valid: true };
  } catch (error: unknown) {
    const zodError = error as {
      errors?: Array<{ path: string[]; message: string }>;
    };
    if (zodError.errors && zodError.errors.length > 0) {
      const errorMessages = zodError.errors
        .filter((err) => {
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

export async function executeAction(
  activeAgent: any,
  actionType: string,
  actionSpace: DeviceAction<any>[],
  value: any,
  deepThink: boolean,
): Promise<any> {
  const action = actionSpace?.find(
    (a: DeviceAction<any>) =>
      a.interfaceAlias === actionType || a.name === actionType,
  );

  if (action && typeof activeAgent.callActionInActionSpace === 'function') {
    if (value.params) {
      const parsedParams = await parseStructuredParams(action, value.params, {
        deepThink,
      });
      return await activeAgent.callActionInActionSpace(
        action.name,
        parsedParams[0],
      );
    } else {
      return await activeAgent.callActionInActionSpace(action.name, {
        prompt: value.prompt,
        deepThink,
      });
    }
  } else {
    const prompt = value.prompt;

    if (actionType === 'aiAssert') {
      const { pass, thought } =
        (await activeAgent?.aiAssert(prompt, undefined, {
          keepRawResponse: true,
        })) || {};
      return { pass, thought };
    }

    if (activeAgent && typeof activeAgent[actionType] === 'function') {
      return await activeAgent[actionType](prompt, {
        deepThink,
      });
    }

    throw new Error(`Unknown action type: ${actionType}`);
  }
}
