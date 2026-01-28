import type {
  BaseElement,
  DeviceAction,
  ElementTreeNode,
  MidsceneYamlFlowItem,
  PlanningAction,
  Rect,
  Size,
} from '@/types';
import { assert, isPlainObject } from '@midscene/shared/utils';

import type { ChatCompletionMessageParam } from 'openai/resources/index';

import { isUITars } from '@/ai-model/auto-glm/util';
import type { PlanningLocateParam } from '@/types';
import { NodeType } from '@midscene/shared/constants';
import type { TModelFamily } from '@midscene/shared/env';
import { treeToList } from '@midscene/shared/extractor';
import { compositeElementInfoImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod';

export type AIArgs = ChatCompletionMessageParam[];

const defaultBboxSize = 20; // must be even number
const debugInspectUtils = getDebug('ai:common');
type AdaptBboxInput = number[] | string[] | string | (number[] | string[])[];

/**
 * Convert a point coordinate [0, 1000] to a small bbox [0, 1000]
 * Creates a small bbox around the center point in the same coordinate space
 *
 * @param x - X coordinate in [0, 1000] range
 * @param y - Y coordinate in [0, 1000] range
 * @param bboxSize - Size of the bbox to create (default: 20)
 * @returns [x1, y1, x2, y2] bbox in [0, 1000] coordinate space
 */
export function pointToBbox(
  x: number,
  y: number,
  bboxSize = defaultBboxSize,
): [number, number, number, number] {
  const halfSize = bboxSize / 2;
  const x1 = Math.max(x - halfSize, 0);
  const y1 = Math.max(y - halfSize, 0);
  const x2 = Math.min(x + halfSize, 1000);
  const y2 = Math.min(y + halfSize, 1000);

  return [x1, y1, x2, y2];
}

// transform the param of locate from qwen mode
export function fillBboxParam(
  locate: PlanningLocateParam,
  width: number,
  height: number,
  modelFamily: TModelFamily | undefined,
) {
  // The Qwen model might have hallucinations of naming bbox as bbox_2d.
  if ((locate as any).bbox_2d && !locate?.bbox) {
    locate.bbox = (locate as any).bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete (locate as any).bbox_2d;
  }

  if (locate?.bbox) {
    locate.bbox = adaptBbox(locate.bbox, width, height, modelFamily);
  }

  return locate;
}

export function adaptQwen2_5Bbox(
  bbox: number[],
): [number, number, number, number] {
  if (bbox.length < 2) {
    const msg = `invalid bbox data for qwen-vl mode: ${JSON.stringify(bbox)} `;
    throw new Error(msg);
  }

  const result: [number, number, number, number] = [
    Math.round(bbox[0]),
    Math.round(bbox[1]),
    typeof bbox[2] === 'number'
      ? Math.round(bbox[2])
      : Math.round(bbox[0] + defaultBboxSize),
    typeof bbox[3] === 'number'
      ? Math.round(bbox[3])
      : Math.round(bbox[1] + defaultBboxSize),
  ];
  return result;
}

export function adaptDoubaoBbox(
  bbox: string[] | number[] | string,
  width: number,
  height: number,
): [number, number, number, number] {
  assert(
    width > 0 && height > 0,
    'width and height must be greater than 0 in doubao mode',
  );

  if (typeof bbox === 'string') {
    assert(
      /^(\d+)\s(\d+)\s(\d+)\s(\d+)$/.test(bbox.trim()),
      `invalid bbox data string for doubao-vision mode: ${bbox}`,
    );
    const splitted = bbox.split(' ');
    if (splitted.length === 4) {
      return [
        Math.round((Number(splitted[0]) * width) / 1000),
        Math.round((Number(splitted[1]) * height) / 1000),
        Math.round((Number(splitted[2]) * width) / 1000),
        Math.round((Number(splitted[3]) * height) / 1000),
      ];
    }
    throw new Error(`invalid bbox data string for doubao-vision mode: ${bbox}`);
  }

  let bboxList: number[] = [];
  if (Array.isArray(bbox) && typeof bbox[0] === 'string') {
    bbox.forEach((item) => {
      if (typeof item === 'string' && item.includes(',')) {
        const [x, y] = item.split(',');
        bboxList.push(Number(x.trim()), Number(y.trim()));
      } else if (typeof item === 'string' && item.includes(' ')) {
        const [x, y] = item.split(' ');
        bboxList.push(Number(x.trim()), Number(y.trim()));
      } else {
        bboxList.push(Number(item));
      }
    });
  } else {
    bboxList = bbox as any;
  }

  if (bboxList.length === 4 || bboxList.length === 5) {
    return [
      Math.round((bboxList[0] * width) / 1000),
      Math.round((bboxList[1] * height) / 1000),
      Math.round((bboxList[2] * width) / 1000),
      Math.round((bboxList[3] * height) / 1000),
    ];
  }

  // treat the bbox as a center point
  if (
    bboxList.length === 6 ||
    bboxList.length === 2 ||
    bboxList.length === 3 ||
    bboxList.length === 7
  ) {
    return [
      Math.max(
        0,
        Math.round((bboxList[0] * width) / 1000) - defaultBboxSize / 2,
      ),
      Math.max(
        0,
        Math.round((bboxList[1] * height) / 1000) - defaultBboxSize / 2,
      ),
      Math.min(
        width,
        Math.round((bboxList[0] * width) / 1000) + defaultBboxSize / 2,
      ),
      Math.min(
        height,
        Math.round((bboxList[1] * height) / 1000) + defaultBboxSize / 2,
      ),
    ];
  }

  if (bbox.length === 8) {
    return [
      Math.round((bboxList[0] * width) / 1000),
      Math.round((bboxList[1] * height) / 1000),
      Math.round((bboxList[4] * width) / 1000),
      Math.round((bboxList[5] * height) / 1000),
    ];
  }

  const msg = `invalid bbox data for doubao-vision mode: ${JSON.stringify(bbox)} `;
  throw new Error(msg);
}

function normalizeBboxInput(
  bbox: AdaptBboxInput,
): number[] | string[] | string {
  if (Array.isArray(bbox)) {
    if (Array.isArray(bbox[0])) {
      return bbox[0] as number[] | string[];
    }
    return bbox as number[] | string[];
  }
  return bbox as string;
}

export function adaptBbox(
  bbox: AdaptBboxInput,
  width: number,
  height: number,
  modelFamily: TModelFamily | undefined,
): [number, number, number, number] {
  const normalizedBbox = normalizeBboxInput(bbox);

  let result: [number, number, number, number] = [0, 0, 0, 0];
  if (modelFamily === 'doubao-vision' || isUITars(modelFamily)) {
    result = adaptDoubaoBbox(normalizedBbox, width, height);
  } else if (modelFamily === 'gemini') {
    result = adaptGeminiBbox(normalizedBbox as number[], width, height);
  } else if (modelFamily === 'qwen2.5-vl') {
    result = adaptQwen2_5Bbox(normalizedBbox as number[]);
  } else {
    // Default: normalized 0-1000 coordinate system
    // Includes: qwen3-vl, glm-v, auto-glm, auto-glm-multilingual, and future models
    result = normalized01000(normalizedBbox as number[], width, height);
  }

  return result;
}

// x1, y1, x2, y2 -> 0-1000
export function normalized01000(
  bbox: number[],
  width: number,
  height: number,
): [number, number, number, number] {
  return [
    Math.round((bbox[0] * width) / 1000),
    Math.round((bbox[1] * height) / 1000),
    Math.round((bbox[2] * width) / 1000),
    Math.round((bbox[3] * height) / 1000),
  ];
}

// y1, x1, y2, x2 -> 0-1000
export function adaptGeminiBbox(
  bbox: number[],
  width: number,
  height: number,
): [number, number, number, number] {
  const left = Math.round((bbox[1] * width) / 1000);
  const top = Math.round((bbox[0] * height) / 1000);
  const right = Math.round((bbox[3] * width) / 1000);
  const bottom = Math.round((bbox[2] * height) / 1000);
  return [left, top, right, bottom];
}

export function adaptBboxToRect(
  bbox: number[],
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
  rightLimit = width,
  bottomLimit = height,
  modelFamily?: TModelFamily | undefined,
): Rect {
  debugInspectUtils(
    'adaptBboxToRect',
    bbox,
    width,
    height,
    'offset',
    offsetX,
    offsetY,
    'limit',
    rightLimit,
    bottomLimit,
    'modelFamily',
    modelFamily,
  );
  const [left, top, right, bottom] = adaptBbox(
    bbox,
    width,
    height,
    modelFamily,
  );

  // Calculate initial rect dimensions and apply boundary constraints
  // For left and top: take max with 0 to ensure they're not negative
  const rectLeft = Math.max(0, left);
  const rectTop = Math.max(0, top);

  // For width and height: calculate from bounded coordinates and constrain to limits
  const boundedRight = Math.min(right, rightLimit);
  const boundedBottom = Math.min(bottom, bottomLimit);

  const rectWidth = boundedRight - rectLeft + 1;
  const rectHeight = boundedBottom - rectTop + 1;

  const rect = {
    left: rectLeft + offsetX,
    top: rectTop + offsetY,
    width: rectWidth,
    height: rectHeight,
  };
  debugInspectUtils('adaptBboxToRect, result=', rect);

  return rect;
}

export function mergeRects(rects: Rect[]) {
  const minLeft = Math.min(...rects.map((r) => r.left));
  const minTop = Math.min(...rects.map((r) => r.top));
  const maxRight = Math.max(...rects.map((r) => r.left + r.width));
  const maxBottom = Math.max(...rects.map((r) => r.top + r.height));
  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

// expand the search area to at least 300 x 300, or add a default padding
export function expandSearchArea(
  rect: Rect,
  screenSize: Size,
  modelFamily: TModelFamily | undefined,
) {
  let minEdgeSize = 500;
  if (modelFamily === 'qwen3-vl') {
    minEdgeSize = 1200;
  }
  const defaultPadding = 160;

  // Calculate padding needed to reach minimum edge size
  const paddingSizeHorizontal =
    rect.width < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.width) / 2)
      : defaultPadding;
  const paddingSizeVertical =
    rect.height < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.height) / 2)
      : defaultPadding;

  // Calculate new dimensions (ensure minimum edge size)
  let newWidth = Math.max(minEdgeSize, rect.width + paddingSizeHorizontal * 2);
  let newHeight = Math.max(minEdgeSize, rect.height + paddingSizeVertical * 2);

  // Calculate initial position with padding
  let newLeft = rect.left - paddingSizeHorizontal;
  let newTop = rect.top - paddingSizeVertical;

  // Ensure the rect doesn't exceed screen boundaries by adjusting position
  // If the rect goes beyond the right edge, shift it left
  if (newLeft + newWidth > screenSize.width) {
    newLeft = screenSize.width - newWidth;
  }

  // If the rect goes beyond the bottom edge, shift it up
  if (newTop + newHeight > screenSize.height) {
    newTop = screenSize.height - newHeight;
  }

  // Ensure the rect doesn't go beyond the left/top edges
  newLeft = Math.max(0, newLeft);
  newTop = Math.max(0, newTop);

  // If after position adjustment, the rect still exceeds screen boundaries,
  // clamp the dimensions to fit within screen
  if (newLeft + newWidth > screenSize.width) {
    newWidth = screenSize.width - newLeft;
  }
  if (newTop + newHeight > screenSize.height) {
    newHeight = screenSize.height - newTop;
  }

  rect.left = newLeft;
  rect.top = newTop;
  rect.width = newWidth;
  rect.height = newHeight;

  return rect;
}

export async function markupImageForLLM(
  screenshotBase64: string,
  tree: ElementTreeNode<BaseElement>,
  size: Size,
) {
  const elementsInfo = treeToList(tree);
  const elementsPositionInfoWithoutText = elementsInfo!.filter(
    (elementInfo) => {
      if (elementInfo.attributes.nodeType === NodeType.TEXT) {
        return false;
      }
      return true;
    },
  );

  const imagePayload = await compositeElementInfoImg({
    inputImgBase64: screenshotBase64,
    elementsPositionInfo: elementsPositionInfoWithoutText,
    size,
  });
  return imagePayload;
}

export function buildYamlFlowFromPlans(
  plans: PlanningAction[],
  actionSpace: DeviceAction<any>[],
): MidsceneYamlFlowItem[] {
  const flow: MidsceneYamlFlowItem[] = [];

  for (const plan of plans) {
    const verb = plan.type;

    const action = actionSpace.find((action) => action.name === verb);
    if (!action) {
      console.warn(
        `Cannot convert action ${verb} to yaml flow. Will ignore it.`,
      );
      continue;
    }

    const flowKey = action.interfaceAlias || verb;
    const flowParam = action.paramSchema
      ? dumpActionParam(plan.param || {}, action.paramSchema)
      : {};

    const flowItem: MidsceneYamlFlowItem = {
      [flowKey]: '',
      ...flowParam,
    };

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
  dpr: z.number().optional(),
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

const locateFieldFlagName = 'midscene_location_field_flag';

// Schema for locator field input (when users provide locate parameters)
const MidsceneLocationInput = z
  .object({
    prompt: TUserPromptSchema,
    deepThink: z.boolean().optional(),
    cacheable: z.boolean().optional(),
    xpath: z.union([z.string(), z.boolean()]).optional(),
  })
  .passthrough();

// Schema for locator field result (when AI returns locate results)
const MidsceneLocationResult = z
  .object({
    [locateFieldFlagName]: z.literal(true),
    prompt: TUserPromptSchema,

    // optional fields
    deepThink: z.boolean().optional(), // only available in vl model
    cacheable: z.boolean().optional(),
    xpath: z.boolean().optional(), // preset result for xpath

    // these two fields will only appear in the result
    center: z.tuple([z.number(), z.number()]),
    rect: RectSchema,
  })
  .passthrough();

// Export the result type - this is used for runtime results that include center and rect
export type MidsceneLocationResultType = z.infer<typeof MidsceneLocationResult>;

// Export the input type - this is the inferred type from getMidsceneLocationSchema()
export type MidsceneLocationInputType = z.infer<typeof MidsceneLocationInput>;

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

    // Method 1: Check for the location field flag (for result schema)
    if (locateFieldFlagName in shape) {
      return true;
    }

    // Method 2: Check if it's the input schema by checking for 'prompt' field
    // Input schema has 'prompt' as a required field
    if ('prompt' in shape && shape.prompt) {
      return true;
    }
  }

  return false;
};

export const dumpMidsceneLocatorField = (field: any): string => {
  assert(
    ifMidsceneLocatorField(field),
    'field is not a midscene locator field',
  );

  // If field is a string, return it directly
  if (typeof field === 'string') {
    return field;
  }

  // If field is an object with prompt property
  if (field && typeof field === 'object' && field.prompt) {
    // If prompt is a string, return it directly
    if (typeof field.prompt === 'string') {
      return field.prompt;
    }
    // If prompt is a TUserPrompt object, extract the prompt string
    if (typeof field.prompt === 'object' && field.prompt.prompt) {
      return field.prompt.prompt; // TODO: dump images if necessary
    }
  }

  // Fallback: try to convert to string
  return String(field);
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
            result[fieldName] = fieldValue.prompt.prompt;
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
 */
export const parseActionParam = (
  rawParam: Record<string, any> | undefined,
  zodSchema?: z.ZodType<any>,
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

  // Restore the actual locate field values (unvalidated, as per business requirement)
  for (const fieldName in locateFieldValues) {
    validated[fieldName] = locateFieldValues[fieldName];
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
