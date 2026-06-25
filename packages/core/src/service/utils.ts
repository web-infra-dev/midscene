import {
  AIResponseParseError,
  extractJSONFromCodeBlock,
} from '@/ai-model/service-caller';
import { expandSearchArea } from '@/common';
import type {
  AIDescribeElementResponse,
  DumpMeta,
  PartialServiceDumpFromSDK,
  Rect,
  ServiceDump,
  Size,
} from '@/types';
import { uuid } from '@midscene/shared/utils';

export const DESCRIBE_POINT_MARKER_MAX_SIZE = 40;
export const DESCRIBE_RECT_MARKER_BORDER_THICKNESS = 1;
export const DESCRIBE_LARGE_RECT_MARKER_BORDER_THICKNESS = 2;
const DESCRIBE_DEEP_LOCATE_MAX_LONG_EDGE = 1000;
const DESCRIBE_DEEP_LOCATE_SCALE = 2;
const DESCRIBE_DEEP_WIDE_CONTEXT_MIN_WIDTH = 900;
const DESCRIBE_DEEP_WIDE_CONTEXT_WIDTH_RATIO = 0.6;
const DESCRIBE_DEEP_WIDE_CONTEXT_TARGET_X_RATIO = 0.75;
const DESCRIBE_DEEP_WIDE_CONTEXT_MIN_HEIGHT = 400;
export const DESCRIBE_WIDE_MARKER_INSET_MIN_WIDTH = 100;
const DESCRIBE_WIDE_MARKER_HORIZONTAL_INSET_RATIO = 0.15;
const DESCRIBE_WIDE_MARKER_VERTICAL_INSET_RATIO = 0.1;

export function clampRect(rect: Rect, size: Size): Rect {
  const width = Math.min(rect.width, size.width);
  const height = Math.min(rect.height, size.height);
  return {
    left: Math.max(0, Math.min(rect.left, size.width - width)),
    top: Math.max(0, Math.min(rect.top, size.height - height)),
    width,
    height,
  };
}

function unionRects(a: Rect, b: Rect, size: Size): Rect {
  const left = Math.max(0, Math.min(a.left, b.left));
  const top = Math.max(0, Math.min(a.top, b.top));
  const right = Math.min(
    size.width,
    Math.max(a.left + a.width, b.left + b.width),
  );
  const bottom = Math.min(
    size.height,
    Math.max(a.top + a.height, b.top + b.height),
  );
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function expandDescribeDeepSearchArea(
  rect: Rect,
  screenSize: Size,
  opt?: { keepWideContext?: boolean },
): Rect {
  const base = expandSearchArea(rect, screenSize);
  const shouldKeepWideRowContext =
    rect.width >= DESCRIBE_POINT_MARKER_MAX_SIZE || opt?.keepWideContext;

  if (!shouldKeepWideRowContext) {
    return base;
  }

  const minWidth = Math.min(
    screenSize.width,
    Math.max(
      base.width,
      DESCRIBE_DEEP_WIDE_CONTEXT_MIN_WIDTH,
      Math.round(screenSize.width * DESCRIBE_DEEP_WIDE_CONTEXT_WIDTH_RATIO),
    ),
  );
  const minHeight = Math.min(
    screenSize.height,
    Math.max(base.height, DESCRIBE_DEEP_WIDE_CONTEXT_MIN_HEIGHT),
  );
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const wideContext = clampRect(
    {
      left: Math.round(
        centerX - minWidth * DESCRIBE_DEEP_WIDE_CONTEXT_TARGET_X_RATIO,
      ),
      top: Math.round(centerY - minHeight / 2),
      width: minWidth,
      height: minHeight,
    },
    screenSize,
  );

  return unionRects(base, wideContext, screenSize);
}

export function getDescribeMarkerRect(rect: Rect): Rect {
  if (rect.width < DESCRIBE_WIDE_MARKER_INSET_MIN_WIDTH) {
    return rect;
  }

  const horizontalInset = Math.round(
    rect.width * DESCRIBE_WIDE_MARKER_HORIZONTAL_INSET_RATIO,
  );
  const verticalInset = Math.round(
    rect.height * DESCRIBE_WIDE_MARKER_VERTICAL_INSET_RATIO,
  );

  return {
    left: rect.left + horizontalInset,
    top: rect.top + verticalInset,
    width: Math.max(rect.width - horizontalInset * 2, 1),
    height: Math.max(rect.height - verticalInset * 2, 1),
  };
}

export function getDescribeMarkerBorderThickness(rect: Rect): number {
  return rect.width <= DESCRIBE_POINT_MARKER_MAX_SIZE &&
    rect.height <= DESCRIBE_POINT_MARKER_MAX_SIZE
    ? DESCRIBE_RECT_MARKER_BORDER_THICKNESS
    : DESCRIBE_LARGE_RECT_MARKER_BORDER_THICKNESS;
}

export function getDescribeDeepLocateResizeSize(size: Size): Size | undefined {
  const maxEdge = Math.max(size.width, size.height);
  if (!maxEdge) {
    return undefined;
  }
  const scale = Math.min(
    DESCRIBE_DEEP_LOCATE_SCALE,
    DESCRIBE_DEEP_LOCATE_MAX_LONG_EDGE / maxEdge,
  );
  if (scale <= 1.05) {
    return undefined;
  }
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}

export function createServiceDump(
  data: PartialServiceDumpFromSDK,
): ServiceDump {
  const baseData: DumpMeta = {
    logTime: Date.now(),
  };
  const finalData: ServiceDump = {
    logId: uuid(),
    ...baseData,
    ...data,
  };

  return finalData;
}

function readNextSignificantChar(input: string, startIndex: number) {
  let index = startIndex;
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }
  return input[index];
}

function extractPossiblyMalformedStringField(input: string, fieldName: string) {
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldStart = new RegExp(`"${escapedFieldName}"\\s*:\\s*"`).exec(input);
  if (!fieldStart) {
    return undefined;
  }

  let index = fieldStart.index + fieldStart[0].length;
  let escaped = false;
  let valueForJsonParse = '';

  for (; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      valueForJsonParse += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      valueForJsonParse += char;
      escaped = true;
      continue;
    }

    if (char !== '"') {
      valueForJsonParse += char;
      continue;
    }

    const nextSignificantChar = readNextSignificantChar(input, index + 1);
    if (
      nextSignificantChar === ',' ||
      nextSignificantChar === '}' ||
      nextSignificantChar === ']' ||
      nextSignificantChar === undefined
    ) {
      try {
        return JSON.parse(`"${valueForJsonParse}"`);
      } catch {
        return valueForJsonParse;
      }
    }

    valueForJsonParse += '\\"';
  }

  return undefined;
}

export function recoverDescribeResponseFromParseError(
  error: unknown,
): Pick<AIDescribeElementResponse, 'description'> | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const rawResponse =
    error instanceof AIResponseParseError
      ? error.rawResponse
      : message.match(/Response -\s*\n\s*([\s\S]*)$/)?.[1];

  if (
    !rawResponse ||
    (!message.includes('failed to parse LLM response into JSON') &&
      !(error instanceof AIResponseParseError))
  ) {
    return undefined;
  }

  const jsonLikeResponse = extractJSONFromCodeBlock(rawResponse);
  const description = extractPossiblyMalformedStringField(
    jsonLikeResponse,
    'description',
  )?.trim();

  if (!description) {
    return undefined;
  }

  return { description };
}
