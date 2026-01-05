import type {
  BaseElement,
  DeviceAction,
  ElementTreeNode,
  MidsceneYamlFlowItem,
  PlanningAction,
  Rect,
  Size,
} from '@/types';
import { assert } from '@midscene/shared/utils';

import type { ChatCompletionMessageParam } from 'openai/resources/index';

import type { PlanningLocateParam } from '@/types';
import { NodeType } from '@midscene/shared/constants';
import type { TVlModeTypes } from '@midscene/shared/env';
import { treeToList } from '@midscene/shared/extractor';
import { compositeElementInfoImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod';

export type AIArgs = ChatCompletionMessageParam[];

const defaultBboxSize = 20; // must be even number
const debugInspectUtils = getDebug('ai:common');
type AdaptBboxInput = number[] | string[] | string | (number[] | string[])[];

// transform the param of locate from qwen mode
export function fillBboxParam(
  locate: PlanningLocateParam,
  width: number,
  height: number,
  rightLimit: number,
  bottomLimit: number,
  vlMode: TVlModeTypes | undefined,
) {
  // The Qwen model might have hallucinations of naming bbox as bbox_2d.
  if ((locate as any).bbox_2d && !locate?.bbox) {
    locate.bbox = (locate as any).bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete (locate as any).bbox_2d;
  }

  if (locate?.bbox) {
    locate.bbox = adaptBbox(
      locate.bbox,
      width,
      height,
      rightLimit,
      bottomLimit,
      vlMode,
    );
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
  rightLimit: number,
  bottomLimit: number,
  vlMode: TVlModeTypes | undefined,
): [number, number, number, number] {
  const normalizedBbox = normalizeBboxInput(bbox);

  let result: [number, number, number, number] = [0, 0, 0, 0];
  if (vlMode === 'doubao-vision' || vlMode === 'vlm-ui-tars') {
    result = adaptDoubaoBbox(normalizedBbox, width, height);
  } else if (vlMode === 'gemini') {
    result = adaptGeminiBbox(normalizedBbox as number[], width, height);
  } else if (vlMode === 'qwen3-vl') {
    result = normalized01000(normalizedBbox as number[], width, height);
  } else {
    result = adaptQwen2_5Bbox(normalizedBbox as number[]);
  }

  result[2] = Math.min(result[2], rightLimit);
  result[3] = Math.min(result[3], bottomLimit);

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
  vlMode?: TVlModeTypes | undefined,
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
    'vlMode',
    vlMode,
  );
  const [left, top, right, bottom] = adaptBbox(
    bbox,
    width,
    height,
    rightLimit,
    bottomLimit,
    vlMode,
  );

  // Calculate initial rect dimensions
  const rectLeft = left;
  const rectTop = top;
  let rectWidth = right - left;
  let rectHeight = bottom - top;

  // Ensure the rect doesn't exceed image boundaries
  // If right edge exceeds width, adjust the width
  if (rectLeft + rectWidth > width) {
    rectWidth = width - rectLeft;
  }

  // If bottom edge exceeds height, adjust the height
  if (rectTop + rectHeight > height) {
    rectHeight = height - rectTop;
  }

  // Ensure minimum dimensions (width and height should be at least 1)
  rectWidth = Math.max(1, rectWidth);
  rectHeight = Math.max(1, rectHeight);

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
  vlMode: TVlModeTypes | undefined,
) {
  let minEdgeSize = 500;
  if (vlMode === 'qwen3-vl') {
    minEdgeSize = 700;
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
  sleep?: number,
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

  if (sleep) {
    flow.push({
      sleep,
    });
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

export const loadActionParam = (
  jsonObject: Record<string, any>,
  zodSchema: z.ZodType<any>,
): Record<string, any> => {
  const locatorFields = findAllMidsceneLocatorField(zodSchema);
  const result = { ...jsonObject };

  for (const fieldName of locatorFields) {
    const fieldValue = result[fieldName];
    if (fieldValue && typeof fieldValue === 'string') {
      result[fieldName] = {
        [locateFieldFlagName]: true,
        prompt: fieldValue,
      };
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
