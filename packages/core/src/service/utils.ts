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

// Deep describe uses a small image set: an overview, a focused crop, and one
// structural crop. Keep the pixel budget centralized so future A/B tuning does
// not scatter model/context-size heuristics across the crop code.
//
// The aspect thresholds are conservative heuristics, not fitted constants. For
// point targets we do not know the real target shape, so the screen-aspect
// thresholds keep a dead zone around square-ish screenshots and fall back to
// balanced context unless the page is clearly wide or tall.
export const DESCRIBE_DEEP_CONTEXT_CONFIG = {
  resize: {
    cropMaxLongEdge: 1000,
    cropUpscaleMaxRatio: 2,
    overviewMaxLongEdge: 1200,
  },
  axisSelection: {
    targetHorizontalAspectThreshold: 1.35,
    targetVerticalAspectThreshold: 0.75,
    pointScreenHorizontalAspectThreshold: 1.15,
    pointScreenVerticalAspectThreshold: 0.85,
    screenHorizontalAspectThreshold: 1.35,
    screenVerticalAspectThreshold: 0.85,
  },
  horizontalContext: {
    minWidth: 900,
    widthRatio: 0.6,
    targetAnchorRatio: 0.75,
    minHeight: 400,
  },
  verticalContext: {
    minHeight: 900,
    heightRatio: 0.6,
    minWidth: 400,
  },
  balancedContext: {
    minEdge: 600,
  },
} as const;

export type DescribeAxisContextMode = 'horizontal' | 'vertical' | 'balanced';

export type DescribeDeepContextArea = {
  kind: 'focused' | 'axis';
  axisMode?: DescribeAxisContextMode;
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

function sameRect(a: Rect, b: Rect): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

function chooseDescribeAxisContextMode(
  rect: Rect,
  screenSize: Size,
  opt?: { targetFromPoint?: boolean },
): DescribeAxisContextMode {
  const rectAspect = rect.width / Math.max(rect.height, 1);
  const screenAspect = screenSize.width / Math.max(screenSize.height, 1);
  const { axisSelection } = DESCRIBE_DEEP_CONTEXT_CONFIG;

  if (
    rect.width >= DESCRIBE_POINT_MARKER_MAX_SIZE &&
    rectAspect >= axisSelection.targetHorizontalAspectThreshold
  ) {
    return 'horizontal';
  }
  if (
    rect.height >= DESCRIBE_POINT_MARKER_MAX_SIZE &&
    rectAspect <= axisSelection.targetVerticalAspectThreshold
  ) {
    return 'vertical';
  }
  if (opt?.targetFromPoint) {
    if (screenAspect >= axisSelection.pointScreenHorizontalAspectThreshold) {
      return 'horizontal';
    }
    if (screenAspect <= axisSelection.pointScreenVerticalAspectThreshold) {
      return 'vertical';
    }
  }
  if (screenAspect >= axisSelection.screenHorizontalAspectThreshold) {
    return 'horizontal';
  }
  if (screenAspect <= axisSelection.screenVerticalAspectThreshold) {
    return 'vertical';
  }
  return 'balanced';
}

function buildDescribeAxisContextArea(
  rect: Rect,
  screenSize: Size,
  focused: Rect,
  opt?: { targetFromPoint?: boolean },
): DescribeDeepContextArea {
  const axisMode = chooseDescribeAxisContextMode(rect, screenSize, opt);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const { horizontalContext, verticalContext, balancedContext } =
    DESCRIBE_DEEP_CONTEXT_CONFIG;

  if (axisMode === 'horizontal') {
    const width = Math.min(
      screenSize.width,
      Math.max(
        focused.width,
        horizontalContext.minWidth,
        Math.round(screenSize.width * horizontalContext.widthRatio),
      ),
    );
    const height = Math.min(
      screenSize.height,
      Math.max(focused.height, horizontalContext.minHeight),
    );
    return {
      kind: 'axis',
      axisMode,
      rect: clampRect(
        {
          left: Math.round(
            centerX - width * horizontalContext.targetAnchorRatio,
          ),
          top: Math.round(centerY - height / 2),
          width,
          height,
        },
        screenSize,
      ),
    };
  }

  if (axisMode === 'vertical') {
    const width = Math.min(
      screenSize.width,
      Math.max(focused.width, verticalContext.minWidth),
    );
    const height = Math.min(
      screenSize.height,
      Math.max(
        focused.height,
        verticalContext.minHeight,
        Math.round(screenSize.height * verticalContext.heightRatio),
      ),
    );
    return {
      kind: 'axis',
      axisMode,
      rect: clampRect(
        {
          left: Math.round(centerX - width / 2),
          top: Math.round(centerY - height / 2),
          width,
          height,
        },
        screenSize,
      ),
    };
  }

  const width = Math.min(
    screenSize.width,
    Math.max(focused.width, balancedContext.minEdge),
  );
  const height = Math.min(
    screenSize.height,
    Math.max(focused.height, balancedContext.minEdge),
  );
  return {
    kind: 'axis',
    axisMode,
    rect: clampRect(
      {
        left: Math.round(centerX - width / 2),
        top: Math.round(centerY - height / 2),
        width,
        height,
      },
      screenSize,
    ),
  };
}

export function getDescribeDeepContextAreas(
  rect: Rect,
  screenSize: Size,
  opt?: { targetFromPoint?: boolean },
): DescribeDeepContextArea[] {
  const focused = expandSearchArea(rect, screenSize);
  const axis = buildDescribeAxisContextArea(rect, screenSize, focused, opt);
  return sameRect(focused, axis.rect)
    ? [{ kind: 'focused', rect: focused }]
    : [{ kind: 'focused', rect: focused }, axis];
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

  const axisContext = buildDescribeAxisContextArea(rect, screenSize, base, {
    targetFromPoint: opt?.keepWideContext,
  });

  return unionRects(base, axisContext.rect, screenSize);
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

export function getDescribeOverviewResizeSize(size: Size): Size | undefined {
  const maxEdge = Math.max(size.width, size.height);
  const { resize } = DESCRIBE_DEEP_CONTEXT_CONFIG;
  if (!maxEdge || maxEdge <= resize.overviewMaxLongEdge) {
    return undefined;
  }
  const scale = resize.overviewMaxLongEdge / maxEdge;
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
