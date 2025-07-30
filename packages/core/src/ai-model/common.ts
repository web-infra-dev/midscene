import type {
  AIUsageInfo,
  BaseElement,
  ElementTreeNode,
  MidsceneYamlFlowItem,
  PlanningAction,
  PlanningActionParamInputOrKeyPress,
  PlanningActionParamScroll,
  PlanningActionParamSleep,
  Rect,
  Size,
} from '@/types';
import { assert } from '@midscene/shared/utils';

import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources';
import {
  callToGetJSONObject,
  checkAIConfig,
  getModelName,
} from './service-caller/index';

import type { PlanningLocateParam } from '@/types';
import { NodeType } from '@midscene/shared/constants';
import { vlLocateMode } from '@midscene/shared/env';
import { treeToList } from '@midscene/shared/extractor';
import { compositeElementInfoImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';

export type AIArgs = [
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
];

export enum AIActionType {
  ASSERT = 0,
  INSPECT_ELEMENT = 1,
  EXTRACT_DATA = 2,
  PLAN = 3,
  DESCRIBE_ELEMENT = 4,
}

export async function callAiFn<T>(
  msgs: AIArgs,
  AIActionTypeValue: AIActionType,
): Promise<{ content: T; usage?: AIUsageInfo }> {
  assert(
    checkAIConfig(),
    'Cannot find config for AI model service. If you are using a self-hosted model without validating the API key, please set `OPENAI_API_KEY` to any non-null value. https://midscenejs.com/model-provider.html',
  );

  const { content, usage } = await callToGetJSONObject<T>(
    msgs,
    AIActionTypeValue,
  );
  return { content, usage };
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
  const minEdgeSize = 300;
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
  sleep?: number,
): MidsceneYamlFlowItem[] {
  const flow: MidsceneYamlFlowItem[] = [];

  for (const plan of plans) {
    const type = plan.type;
    const locate = plan.locate?.prompt!; // TODO: check if locate is null

    if (type === 'Tap') {
      flow.push({
        aiTap: locate!,
      });
    } else if (type === 'Hover') {
      flow.push({
        aiHover: locate!,
      });
    } else if (type === 'Input') {
      const param = plan.param as PlanningActionParamInputOrKeyPress;
      flow.push({
        aiInput: param.value,
        locate,
      });
    } else if (type === 'KeyboardPress') {
      const param = plan.param as PlanningActionParamInputOrKeyPress;
      flow.push({
        aiKeyboardPress: param.value,
        locate,
      });
    } else if (type === 'Scroll') {
      const param = plan.param as PlanningActionParamScroll;
      flow.push({
        aiScroll: null,
        locate,
        direction: param.direction,
        scrollType: param.scrollType,
        distance: param.distance,
      });
    } else if (type === 'Sleep') {
      const param = plan.param as PlanningActionParamSleep;
      flow.push({
        sleep: param.timeMs,
      });
    } else if (
      type === 'AndroidBackButton' ||
      type === 'AndroidHomeButton' ||
      type === 'AndroidRecentAppsButton' ||
      type === 'AndroidLongPress'
    ) {
      // not implemented in yaml yet
    } else if (
      type === 'Error' ||
      type === 'ExpectedFalsyCondition' ||
      type === 'Assert' ||
      type === 'AssertWithoutThrow' ||
      type === 'Finished'
    ) {
      // do nothing
    } else {
      console.warn(
        `Cannot convert action ${type} to yaml flow. This should be a bug of Midscene.`,
      );
    }
  }

  if (sleep) {
    flow.push({
      sleep: sleep,
    });
  }

  return flow;
}
