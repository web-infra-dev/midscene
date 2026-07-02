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
export const DESCRIBE_WIDE_MARKER_INSET_MIN_WIDTH = 100;
const DESCRIBE_WIDE_MARKER_HORIZONTAL_INSET_RATIO = 0.15;
const DESCRIBE_WIDE_MARKER_VERTICAL_INSET_RATIO = 0.1;

// Deep describe uses two images: an overview for page-level ownership and a
// focused crop for local detail. The overview keeps the original screenshot
// size; only focused crops may be upscaled for small local details.
export const DESCRIBE_DEEP_CONTEXT_CONFIG = {
  resize: {
    cropMaxLongEdge: 1000,
    cropUpscaleMaxRatio: 2,
  },
} as const;

export type DescribeDeepContextArea = {
  kind: 'focused';
  rect: Rect;
};

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

export function getDescribeDeepContextAreas(
  rect: Rect,
  screenSize: Size,
): DescribeDeepContextArea[] {
  return [{ kind: 'focused', rect: expandSearchArea(rect, screenSize) }];
}

export function getRectInCrop(
  rect: Rect,
  cropRect: Rect,
  cropSize: Size,
): Rect {
  return clampRect(
    {
      left: rect.left - cropRect.left,
      top: rect.top - cropRect.top,
      width: rect.width,
      height: rect.height,
    },
    cropSize,
  );
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
  const { resize } = DESCRIBE_DEEP_CONTEXT_CONFIG;
  const scale = Math.min(
    resize.cropUpscaleMaxRatio,
    resize.cropMaxLongEdge / maxEdge,
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
