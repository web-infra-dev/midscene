import type { DeviceAction } from '@midscene/core';
import { findAllMidsceneLocatorField } from '@midscene/core/ai-model';
import type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
} from './types';

// APIs that should not generate replay scripts
export const dataExtractionAPIs = [
  'aiQuery',
  'aiBoolean',
  'aiNumber',
  'aiString',
  'aiAsk',
];

export const validationAPIs = ['aiAssert', 'aiWaitFor'];

export const noReplayAPIs = [...dataExtractionAPIs, ...validationAPIs];

export const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';

  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }

  if (errorMessage.includes('NOT_IMPLEMENTED_AS_DESIGNED')) {
    return 'Further actions cannot be performed in the current environment';
  }

  return errorMessage || 'Unknown error';
};

// Parse structured parameters for callActionInActionSpace
async function parseStructuredParams(
  action: DeviceAction<unknown>,
  params: Record<string, unknown>,
  options: ExecutionOptions = {},
): Promise<unknown[]> {
  if (!action?.paramSchema || !('shape' in action.paramSchema)) {
    return [params.prompt || '', options];
  }

  const schema = action.paramSchema;
  const keys =
    schema && 'shape' in schema
      ? Object.keys((schema as { shape: Record<string, unknown> }).shape)
      : [];

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
    const paramsForValidation = { ...value.params };

    const schema = action.paramSchema;
    if (schema) {
      const locatorFieldKeys = findAllMidsceneLocatorField(schema);
      locatorFieldKeys.forEach((key: string) => {
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
  activeAgent: PlaygroundAgent,
  actionType: string,
  actionSpace: DeviceAction<unknown>[],
  value: FormValue,
  options: ExecutionOptions,
): Promise<unknown> {
  const action = actionSpace?.find(
    (a: DeviceAction<unknown>) =>
      a.interfaceAlias === actionType || a.name === actionType,
  );

  if (action && typeof activeAgent.callActionInActionSpace === 'function') {
    if (value.params) {
      const parsedParams = await parseStructuredParams(
        action,
        value.params,
        options,
      );
      return await activeAgent.callActionInActionSpace(
        action.name,
        parsedParams[0],
      );
    } else {
      return await activeAgent.callActionInActionSpace(action.name, {
        prompt: value.prompt,
        ...options,
      });
    }
  } else {
    const prompt = value.prompt;

    if (actionType === 'aiAssert') {
      const { pass, thought } =
        (await activeAgent?.aiAssert?.(prompt || '', undefined, {
          keepRawResponse: true,
          ...options,
        })) || {};
      return { pass: pass || false, thought: thought || '' };
    }

    // Fallback for methods not found in actionSpace
    if (activeAgent && typeof (activeAgent as any)[actionType] === 'function') {
      return await (activeAgent as any)[actionType](prompt, options);
    }

    throw new Error(`Unknown action type: ${actionType}`);
  }
}
