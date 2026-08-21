import type {
  DeviceAction,
  MidsceneYamlFlowItem,
  PlanningAction,
} from '@/types';
import { isPlainObject } from '@midscene/shared/utils';
import { z } from 'zod';

export function findActionInActionSpaceOrThrow(
  planType: string,
  actionSpace: DeviceAction<any>[],
): DeviceAction<any> {
  const action = actionSpace.find((item) => item.name === planType);
  if (!action) {
    const available = actionSpace.map((item) => item.name).join(', ');
    throw new Error(
      `Action type '${planType}' is not in the current action space. Available actions: ${available || '(none)'}`,
    );
  }
  return action;
}

export function buildYamlFlowFromPlans(
  plans: PlanningAction[],
  actionSpace: DeviceAction<any>[],
): MidsceneYamlFlowItem[] {
  const flow: MidsceneYamlFlowItem[] = [];

  for (const plan of plans) {
    const verb = plan.type;

    const action = findActionInActionSpaceOrThrow(verb, actionSpace);

    const flowKey = action.interfaceAlias || verb;
    const flowParam = action.paramSchema
      ? dumpActionParam(plan.param || {}, action.paramSchema)
      : {};

    // For actions whose param is a single string field (e.g. Launch/Terminate's
    // `uri`, RunAdbShell's `command`), inline the value on the flowKey. Writing
    // `{ terminate: '', uri: '...' }` makes the YAML player treat the empty
    // string as the param and drop the sibling `uri`, so cache replay would
    // call the action with an empty argument.
    const shortcutField =
      action.name === 'Launch' || action.interfaceAlias === 'launch'
        ? 'uri'
        : action.name === 'Terminate' || action.interfaceAlias === 'terminate'
          ? 'uri'
          : action.name === 'RunAdbShell' ||
              action.interfaceAlias === 'runAdbShell' ||
              action.name === 'RunHdcShell' ||
              action.interfaceAlias === 'runHdcShell'
            ? 'command'
            : undefined;
    const shortcutKeys = shortcutField ? Object.keys(flowParam) : [];
    const canInlineShortcut =
      shortcutField &&
      shortcutKeys.length === 1 &&
      shortcutKeys[0] === shortcutField &&
      typeof flowParam[shortcutField] === 'string';

    const flowItem: MidsceneYamlFlowItem = canInlineShortcut
      ? { [flowKey]: flowParam[shortcutField as string] }
      : { [flowKey]: '', ...flowParam };

    flow.push(flowItem);
  }

  return flow;
}

// Zod schemas for shared types
export const PointSchema = z.object({
  left: z.number(),
  top: z.number(),
});

export const SizeSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export const RectSchema = PointSchema.and(SizeSchema).and(
  z.object({
    zoom: z.number().optional(),
  }),
);

// Zod schema for TMultimodalPrompt
export const TMultimodalPromptSchema = z.object({
  images: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  convertHttpImage2Base64: z.boolean().optional(),
});

// Zod schema for TUserPrompt
export const TUserPromptSchema = z.union([
  z.string(),
  z
    .object({
      prompt: z.string(),
    })
    .and(TMultimodalPromptSchema.partial()),
]);

// Generate TypeScript types from Zod schemas
export type TMultimodalPrompt = z.infer<typeof TMultimodalPromptSchema>;
export type TUserPrompt = z.infer<typeof TUserPromptSchema>;

export const userPromptToString = (prompt: TUserPrompt): string => {
  return typeof prompt === 'string' ? prompt : prompt.prompt;
};

export const userPromptToMultimodalPrompt = (
  prompt: TUserPrompt,
): TMultimodalPrompt | undefined => {
  if (typeof prompt === 'string' || !prompt.images) {
    return undefined;
  }
  return {
    images: prompt.images,
    convertHttpImage2Base64: !!prompt.convertHttpImage2Base64,
  };
};

// Schema for locator field input (when users provide locate parameters)
const MidsceneLocationInput = z
  .object({
    prompt: TUserPromptSchema,
    deepLocate: z.boolean().optional(),
    deepThink: z
      .boolean()
      .optional()
      .describe('@deprecated Use `deepLocate` instead.'),
    cacheable: z.boolean().optional(),
    xpath: z.union([z.string(), z.boolean()]).optional(),
  })
  .passthrough();

/**
 * Returns the schema for locator fields.
 * This now returns the input schema which is more permissive and suitable for validation.
 */
export const getMidsceneLocationSchema = () => {
  return MidsceneLocationInput;
};

export const ifMidsceneLocatorField = (field: any): boolean => {
  // Handle optional fields by getting the inner type
  let actualField = field;
  if (actualField._def?.typeName === 'ZodOptional') {
    actualField = actualField._def.innerType;
  }

  // Check if this is a ZodObject
  if (actualField._def?.typeName === 'ZodObject') {
    const shape = actualField._def.shape();

    // Input schema has 'prompt' as a required field
    if ('prompt' in shape && shape.prompt) {
      return true;
    }
  }

  return false;
};

const formatPromptWithImages = (
  promptObj: Exclude<TUserPrompt, string>,
): string => {
  let promptString = promptObj.prompt;
  if (Array.isArray(promptObj.images) && promptObj.images.length > 0) {
    const imageCount = promptObj.images.length;
    promptString += ` (with ${imageCount} image${imageCount > 1 ? 's' : ''})`;
  }
  return promptString;
};

export const findAllMidsceneLocatorField = (
  zodType?: z.ZodType<any>,
  requiredOnly?: boolean,
): string[] => {
  if (!zodType) {
    return [];
  }

  // Check if this is a ZodObject by checking if it has a shape property
  const zodObject = zodType as any;
  if (zodObject._def?.typeName === 'ZodObject' && zodObject.shape) {
    const keys = Object.keys(zodObject.shape);
    return keys.filter((key) => {
      const field = zodObject.shape[key];
      // TODO: A similar locator-field check exists as isMidsceneLocatorField in
      // @midscene/shared/zod-schema-utils.
      if (!ifMidsceneLocatorField(field)) {
        return false;
      }

      // If requiredOnly is true, filter out optional fields
      if (requiredOnly) {
        return field._def?.typeName !== 'ZodOptional';
      }

      return true;
    });
  }

  // For other ZodType instances, we can't extract field names
  return [];
};

export const dumpActionParam = (
  jsonObject: Record<string, any>,
  zodSchema: z.ZodType<any>,
): Record<string, any> => {
  // Prevent spreading strings into {0: 'c', 1: 'o', ...}
  if (!isPlainObject(jsonObject)) {
    return {};
  }

  const locatorFields = findAllMidsceneLocatorField(zodSchema);
  const result = { ...jsonObject };

  for (const fieldName of locatorFields) {
    const fieldValue = result[fieldName];
    if (fieldValue) {
      // If it's already a string, keep it as is
      if (typeof fieldValue === 'string') {
        result[fieldName] = fieldValue;
      } else if (typeof fieldValue === 'object') {
        // Check if this field is actually a MidsceneLocationType object
        if (fieldValue.prompt) {
          // If prompt is a string, use it directly
          if (typeof fieldValue.prompt === 'string') {
            result[fieldName] = fieldValue.prompt;
          } else if (
            typeof fieldValue.prompt === 'object' &&
            fieldValue.prompt.prompt
          ) {
            // If prompt is a TUserPrompt object, extract the prompt string
            result[fieldName] = formatPromptWithImages(fieldValue.prompt);
          }
        }
      }
    }
  }

  return result;
};

/**
 * Parse and validate action parameters using Zod schema.
 * All fields are validated through Zod, EXCEPT locator fields which are skipped.
 * Default values defined in the schema are automatically applied.
 *
 * Locator fields are special business logic fields with complex validation requirements,
 * so they are intentionally excluded from Zod parsing and use existing validation logic.
 *
 * When shrunkShotToLogicalRatio is provided and !== 1, coordinates in locate fields
 * are transformed from screenshot space to logical space.
 */
export const parseActionParam = (
  rawParam: Record<string, any> | undefined,
  zodSchema?: z.ZodType<any>,
  options?: { shrunkShotToLogicalRatio?: number },
): Record<string, any> | undefined => {
  // If no schema is provided, return undefined (action takes no parameters)
  if (!zodSchema) {
    return undefined;
  }

  // Handle undefined or null rawParam by providing an empty object
  const param = rawParam ?? {};

  // Find all locate fields in the schema
  const locateFields = findAllMidsceneLocatorField(zodSchema);

  // If there are no locate fields, just do normal validation
  if (locateFields.length === 0) {
    return zodSchema.parse(param);
  }

  // Extract locate field values to restore later
  const locateFieldValues: Record<string, any> = {};
  for (const fieldName of locateFields) {
    if (fieldName in param) {
      locateFieldValues[fieldName] = param[fieldName];
    }
  }

  // Build params for validation - skip locate fields and use dummy values
  const paramsForValidation: Record<string, any> = {};
  for (const key in param) {
    if (locateFields.includes(key)) {
      // Use dummy value to satisfy schema validation
      paramsForValidation[key] = { prompt: '_dummy_' };
    } else {
      paramsForValidation[key] = param[key];
    }
  }

  // Validate with dummy locate values
  const validated = zodSchema.parse(paramsForValidation);

  // Restore the actual locate field values (unvalidated, as per business requirement),
  // and transform coordinates from screenshot space to logical space if needed
  const ratio = options?.shrunkShotToLogicalRatio;
  for (const fieldName in locateFieldValues) {
    let value = locateFieldValues[fieldName];
    if (
      ratio !== undefined &&
      ratio !== 1 &&
      value &&
      typeof value === 'object' &&
      value.center &&
      value.rect
    ) {
      value = {
        ...value,
        center: [
          Math.round(value.center[0] / ratio),
          Math.round(value.center[1] / ratio),
        ],
        rect: {
          ...value.rect,
          left: Math.round(value.rect.left / ratio),
          top: Math.round(value.rect.top / ratio),
          width: Math.round(value.rect.width / ratio),
          height: Math.round(value.rect.height / ratio),
        },
      };
    }
    validated[fieldName] = value;
  }

  return validated;
};

export const finalizeActionName = 'Finalize';

/**
 * Get a readable time string for a given timestamp or the current time
 * @param format - Optional format string. Supports: YYYY, MM, DD, HH, mm, ss. Default: 'YYYY-MM-DD HH:mm:ss'
 * @param timestamp - Optional timestamp in milliseconds. If not provided, uses current system time.
 * @returns A formatted time string with format label
 */
export const getReadableTimeString = (
  format = 'YYYY-MM-DD HH:mm:ss',
  timestamp?: number,
): string => {
  const now = timestamp !== undefined ? new Date(timestamp) : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const timeString = format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);

  return `${timeString} (${format})`;
};
