import type {
  AIUsageInfo,
  BaseElement,
  DeviceAction,
  ElementTreeNode,
  MidsceneYamlFlowItem,
  PlanningAction,
  Rect,
  Size,
} from '@/types';
import { assert } from '@midscene/shared/utils';

import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import {
  call,
  callToGetJSONObject,
  getModelName,
} from './service-caller/index';

import type { PlanningLocateParam } from '@/types';
import { NodeType } from '@midscene/shared/constants';
import { vlLocateMode } from '@midscene/shared/env';
import { treeToList } from '@midscene/shared/extractor';
import { compositeElementInfoImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

export enum AIActionType {
  ASSERT = 0,
  INSPECT_ELEMENT = 1,
  EXTRACT_DATA = 2,
  PLAN = 3,
  DESCRIBE_ELEMENT = 4,
}

export const actionSpaceTypePrefix = 'action_space_';

export async function callAiFn<T>(
  msgs: AIArgs,
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  const jsonObject = await callToGetJSONObject<T>(msgs, AIActionTypeValue);

  return {
    content: jsonObject.content,
    usage: jsonObject.usage,
  };
}

const defaultBboxSize = 20; // must be even number
const debugInspectUtils = getDebug('ai:common');

// transform the param of locate from qwen mode
export function fillBboxParam(
  locate: PlanningLocateParam,
  width: number,
  height: number,
) {
  // The Qwen model might have hallucinations of naming bbox as bbox_2d.
  if ((locate as any).bbox_2d && !locate?.bbox) {
    locate.bbox = (locate as any).bbox_2d;
    // biome-ignore lint/performance/noDelete: <explanation>
    delete (locate as any).bbox_2d;
  }

  if (locate?.bbox) {
    locate.bbox = adaptBbox(locate.bbox, width, height);
  }

  return locate;
}

export function adaptQwenBbox(
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

  if (Array.isArray(bbox) && Array.isArray(bbox[0])) {
    bbox = bbox[0];
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

export function adaptBbox(
  bbox: number[],
  width: number,
  height: number,
): [number, number, number, number] {
  if (vlLocateMode() === 'doubao-vision' || vlLocateMode() === 'vlm-ui-tars') {
    return adaptDoubaoBbox(bbox, width, height);
  }

  if (vlLocateMode() === 'gemini') {
    return adaptGeminiBbox(bbox, width, height);
  }

  return adaptQwenBbox(bbox);
}

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
): Rect {
  debugInspectUtils('adaptBboxToRect', bbox, width, height, offsetX, offsetY);
  const [left, top, right, bottom] = adaptBbox(bbox, width, height);
  const rect = {
    left: left + offsetX,
    top: top + offsetY,
    width: right - left,
    height: bottom - top,
  };
  debugInspectUtils('adaptBboxToRect, result=', rect);
  return rect;
}

let warned = false;
export function warnGPT4oSizeLimit(size: Size) {
  if (warned) return;
  if (getModelName()?.toLowerCase().includes('gpt-4o')) {
    const warningMsg = `GPT-4o has a maximum image input size of 2000x768 or 768x2000, but got ${size.width}x${size.height}. Please set your page to a smaller resolution. Otherwise, the result may be inaccurate.`;

    if (
      Math.max(size.width, size.height) > 2000 ||
      Math.min(size.width, size.height) > 768
    ) {
      console.warn(warningMsg);
      warned = true;
    }
  } else if (size.width > 1800 || size.height > 1800) {
    console.warn(
      `The image size seems too large (${size.width}x${size.height}). It may lead to more token usage, slower response, and inaccurate result.`,
    );
    warned = true;
  }
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
export function expandSearchArea(rect: Rect, screenSize: Size) {
  const minEdgeSize = vlLocateMode() === 'doubao-vision' ? 500 : 300;
  const defaultPadding = 160;

  const paddingSizeHorizontal =
    rect.width < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.width) / 2)
      : defaultPadding;
  const paddingSizeVertical =
    rect.height < minEdgeSize
      ? Math.ceil((minEdgeSize - rect.height) / 2)
      : defaultPadding;
  rect.left = Math.max(0, rect.left - paddingSizeHorizontal);
  rect.width = Math.min(
    rect.width + paddingSizeHorizontal * 2,
    screenSize.width - rect.left,
  );
  rect.top = Math.max(0, rect.top - paddingSizeVertical);
  rect.height = Math.min(
    rect.height + paddingSizeVertical * 2,
    screenSize.height - rect.top,
  );
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

    const locate = plan.locate?.prompt;
    const flowKey = action.interfaceAlias || `${actionSpaceTypePrefix}${verb}`;

    const flowItem: MidsceneYamlFlowItem = {
      [flowKey]: locate || '',
      ...(plan.param || {}),
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

export const MidsceneLocation = z
  .object({
    midscene_location_field_flag: z.literal(true),
    prompt: z.string(),
    center: z.tuple([z.number(), z.number()]),
    rect: RectSchema,
  })
  .passthrough();

export type MidsceneLocationType = z.infer<typeof MidsceneLocation>;

export const ifMidsceneLocatorField = (field: any): boolean => {
  // Handle optional fields by getting the inner type
  let actualField = field;
  if (actualField._def?.typeName === 'ZodOptional') {
    actualField = actualField._def.innerType;
  }

  // Check if this is a ZodObject with midscene_location_field_flag
  if (actualField._def?.typeName === 'ZodObject') {
    const shape = actualField._def.shape();
    return 'midscene_location_field_flag' in shape;
  }

  return false;
};

export const findAllMidsceneLocatorField = (
  zodType?: z.ZodType<any>,
): string[] => {
  if (!zodType) {
    return [];
  }

  // Check if this is a ZodObject by checking if it has a shape property
  const zodObject = zodType as any;
  if (zodObject._def?.typeName === 'ZodObject' && zodObject.shape) {
    const keys = Object.keys(zodObject.shape);
    return keys.filter((key) => ifMidsceneLocatorField(zodObject.shape[key]));
  }

  // For other ZodType instances, we can't extract field names
  return [];
};
