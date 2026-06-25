import type { ModelRuntime } from '@/ai-model/models';
import {
  buildDescribeRetryDiagnosticPrompt,
  buildDiagnosticRetryHint,
} from '@/ai-model/prompt/describe';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import {
  compositeElementInfoImg,
  compositePointMarkerImg,
  cropByRect,
} from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import { createScreenshotBoundUIContext } from './agent/utils';
import type Service from './service';
import {
  getDescribeMarkerBorderThickness,
  getDescribeMarkerRect,
} from './service/utils';
import type {
  AgentDescribeElementAtPointResult,
  DescribeElementVisualDiagnosticResult,
  LocateOption,
  LocateResultElement,
  LocateValidatorResult,
  LocatorValidatorOption,
  Rect,
  Size,
  UIContext,
} from './types';
import { buildDetailedLocateParam } from './yaml/utils';

export type DescribeElementCoordinateSpace = 'screenshot' | 'logical';

export type LocatorVerifyFn = (input: {
  prompt: string;
  expectCenter: [number, number];
  deepLocate: boolean;
  retryCount: number;
  verifyResult: LocateValidatorResult;
}) => LocateValidatorResult | boolean;

export type DescribeElementRetryStrategy = 'none' | 'diagnostic';

export type DescribeElementAtPointOptions = {
  verifyPrompt?: boolean;
  retryLimit?: number;
  deepLocate?: boolean;
  targetRect?: Rect;
  retryStrategy?: DescribeElementRetryStrategy;
  locatorVerifyFn?: LocatorVerifyFn;
  screenshotBase64?: string;
  screenshotSize?: Size;
  coordinateSpace?: DescribeElementCoordinateSpace;
  logicalSize?: Size;
  onProgress?: (progress: {
    prompt?: string;
    deepLocate?: boolean;
    visualDiagnostic?: DescribeElementVisualDiagnosticResult;
    verifyResult?: LocateValidatorResult;
  }) => void;
} & LocatorValidatorOption;

type ScreenshotBoundContextOptions = {
  screenshotBase64?: string;
  screenshotSize?: Size;
  coordinateSpace?: DescribeElementCoordinateSpace;
  logicalSize?: Size;
};

export type VerifyElementDescriptionAtPointOptions =
  ScreenshotBoundContextOptions & LocatorValidatorOption;

export type VerifyElementByServiceLocateOptions =
  VerifyElementDescriptionAtPointOptions &
    Pick<LocateOption, 'cacheable' | 'deepLocate' | 'xpath'> & {
      abortSignal?: AbortSignal;
    };

export type ElementDescriberRuntime = {
  service: Pick<Service, 'describe' | 'locate'>;
  describeModelRuntime: ModelRuntime;
  locateModelRuntime: ModelRuntime;
};

type ServiceDescribeOptions = NonNullable<
  Parameters<ElementDescriberRuntime['service']['describe']>[2]
>;
type ElementDescriptionDescriptor = Pick<
  AgentDescribeElementAtPointResult,
  'target' | 'primitive' | 'owner' | 'disambiguator' | 'context'
>;
type DescribeTargetMarker = Rect | [number, number];

const VISUAL_DIAGNOSTIC_CENTER_CROP_SIZE = 128;
const VISUAL_DIAGNOSTIC_MIN_CONFIDENCE = 0.65;

function normalizeDescribeRetryStrategy(
  retryStrategy?: DescribeElementRetryStrategy,
): DescribeElementRetryStrategy {
  const normalized = retryStrategy || 'none';
  assert(
    normalized === 'none' || normalized === 'diagnostic',
    `Unsupported describe retry strategy: ${normalized}`,
  );
  return normalized;
}

const distanceOfTwoPoints = (p1: [number, number], p2: [number, number]) => {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  return Math.round(Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2));
};

const includedInRect = (point: [number, number], rect: Rect) => {
  const [x, y] = point;
  const { left, top, width, height } = rect;
  return x >= left && x <= left + width && y >= top && y <= top + height;
};

const buildLocateValidatorResult = (
  expectCenter: [number, number],
  located: Pick<LocateResultElement, 'center' | 'rect'>,
  verifyLocateOption?: LocatorValidatorOption,
): LocateValidatorResult => {
  const distance = distanceOfTwoPoints(expectCenter, located.center);
  const included = includedInRect(expectCenter, located.rect);
  const pass =
    distance <= (verifyLocateOption?.centerDistanceThreshold || 20) || included;
  return {
    pass,
    rect: located.rect,
    center: located.center,
    centerDistance: distance,
    includedInRect: included,
  };
};

function assertPositiveSize(
  size: Size | undefined,
  label: string,
): asserts size is Size {
  assert(
    size &&
      Number.isFinite(size.width) &&
      Number.isFinite(size.height) &&
      size.width > 0 &&
      size.height > 0,
    `${label} must include positive width and height`,
  );
}

const mapPointToScreenshotSpace = (
  center: [number, number],
  screenshotSize: Size,
  opt: ScreenshotBoundContextOptions,
): [number, number] => {
  const coordinateSpace = opt.coordinateSpace || 'screenshot';
  if (coordinateSpace === 'screenshot') {
    return center;
  }

  assertPositiveSize(
    opt.logicalSize,
    'logicalSize is required when coordinateSpace is logical',
  );
  return [
    (center[0] * screenshotSize.width) / opt.logicalSize.width,
    (center[1] * screenshotSize.height) / opt.logicalSize.height,
  ];
};

const mapRectToScreenshotSpace = (
  rect: Rect,
  screenshotSize: Size,
  opt: ScreenshotBoundContextOptions,
): Rect => {
  const coordinateSpace = opt.coordinateSpace || 'screenshot';
  if (coordinateSpace === 'screenshot') {
    return rect;
  }

  assertPositiveSize(
    opt.logicalSize,
    'logicalSize is required when coordinateSpace is logical',
  );
  return {
    left: (rect.left * screenshotSize.width) / opt.logicalSize.width,
    top: (rect.top * screenshotSize.height) / opt.logicalSize.height,
    width: (rect.width * screenshotSize.width) / opt.logicalSize.width,
    height: (rect.height * screenshotSize.height) / opt.logicalSize.height,
  };
};

const createScreenshotBoundLocatorContext = async (
  center: [number, number],
  opt?: ScreenshotBoundContextOptions & { targetRect?: Rect },
): Promise<{
  screenshotContext?: UIContext;
  locateOpt?: LocateOption;
  targetCenter: [number, number];
  targetRect?: Rect;
}> => {
  const screenshotContext = opt?.screenshotBase64
    ? await createScreenshotBoundUIContext(opt.screenshotBase64, opt)
    : undefined;
  const targetCenter = screenshotContext
    ? mapPointToScreenshotSpace(center, screenshotContext.shotSize, opt || {})
    : center;
  const targetRect =
    screenshotContext && opt?.targetRect
      ? mapRectToScreenshotSpace(
          opt.targetRect,
          screenshotContext.shotSize,
          opt,
        )
      : opt?.targetRect;
  return {
    screenshotContext,
    locateOpt: screenshotContext ? { uiContext: screenshotContext } : undefined,
    targetCenter,
    targetRect,
  };
};

export async function verifyLocator(
  runtime: Pick<ElementDescriberRuntime, 'service' | 'locateModelRuntime'>,
  prompt: string,
  locateOpt: LocateOption | undefined,
  expectCenter: [number, number],
  verifyLocateOption?: LocatorValidatorOption &
    Pick<LocateOption, 'deepLocate'> & {
      tightLocate?: boolean;
      descriptor?: ElementDescriptionDescriptor;
      locateInstruction?: string;
    },
): Promise<LocateValidatorResult> {
  return locateAndVerify(runtime, prompt, expectCenter, {
    centerDistanceThreshold: verifyLocateOption?.centerDistanceThreshold,
    deepLocate: verifyLocateOption?.deepLocate,
    tightLocate: verifyLocateOption?.tightLocate,
    descriptor: verifyLocateOption?.descriptor,
    locateInstruction: verifyLocateOption?.locateInstruction,
    uiContext: locateOpt?.uiContext,
  });
}

function applyLocatorVerifyFn(
  locatorVerifyFn: LocatorVerifyFn | undefined,
  input: Parameters<LocatorVerifyFn>[0],
): LocateValidatorResult {
  if (!locatorVerifyFn) {
    return input.verifyResult;
  }
  const customResult = locatorVerifyFn(input);
  if (typeof customResult === 'boolean') {
    return {
      ...input.verifyResult,
      pass: customResult,
    };
  }
  return customResult;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTightLocatePrompt(
  description: string,
  locateInstruction?: string,
): string {
  return [
    'Locate the tightest bounding box for the exact target described below.',
    'First identify the target type, then return only that exact target: substring, link segment, icon, control body, dropdown trigger/value, option row, status label, or cell content.',
    'Do not return a parent container, whole sentence, whole text line, whole row, or group of adjacent text/links when the description names a smaller target.',
    'If the target is a wrapped text or link, return a tight box around a distinctive visible segment instead of one large box covering every wrapped line.',
    'If the target is an input/select/dropdown/filter field body, current value, trigger, or blank field region, return that field/control body or value region instead of a trailing icon or nearby header.',
    'If the target is a tiny icon/control among adjacent similar icons, use the described local order or relative position within that group and return only that glyph/control.',
    locateInstruction
      ? `Diagnostic locator constraint: ${locateInstruction}`
      : undefined,
    `Target: ${description}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildStructuredLocatePrompt(
  description: string,
  descriptor?: ElementDescriptionDescriptor,
  locateInstruction?: string,
): string {
  const entries = [
    ['target primitive', descriptor?.primitive],
    ['target itself', descriptor?.target],
    ['owner/context', descriptor?.owner],
    ['disambiguator', descriptor?.disambiguator],
    ['nearby context', descriptor?.context],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));

  if (entries.length === 0) {
    return buildTightLocatePrompt(description, locateInstruction);
  }

  return [
    'Locate the tightest bounding box for the exact target described below.',
    'Use the structured fields to separate the target itself from owner/context.',
    ...entries.map(([label, value]) => `- ${label}: ${value}`),
    `- final locator description: ${description}`,
    '',
    'Selection rules:',
    '- Return the target itself, not the owner/context used only to disambiguate it.',
    '- If the primitive is icon, arrow, control, button accessory, or region, do not return adjacent text just because it names the owner.',
    '- If the primitive is a tiny icon/control among adjacent similar icons, use the disambiguator or nearby context for local order/relative position and return only that glyph/control.',
    '- If the primitive is text, link, status, or input value, return only that tight text/control region, not the whole row, card, sentence, or container.',
    '- If a text or link target wraps across lines, return a tight box around a distinctive visible segment of the target text. For CJK link labels, the first 2-4 visible characters are enough when unique.',
    '- If the primitive is dropdown or option, return the dropdown trigger/current value/control body or the option row/text itself. Treat select/combobox controls as dropdown. Do not retarget to a trailing search, clear, or arrow icon unless the primitive is explicitly icon/arrow and the endpoint is on that glyph.',
    '- If the primitive is input, control, region, or blank field body, return the field/control body or value region, not a trailing search/dropdown/clear icon and not a nearby table header.',
    '- For repeated candidates, choose the one in the same local owner/context and disambiguator.',
    locateInstruction
      ? `- Diagnostic locator constraint: ${locateInstruction}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

function compactDescriptionDescriptor(
  descriptor?: ElementDescriptionDescriptor,
): ElementDescriptionDescriptor {
  return Object.fromEntries(
    Object.entries(descriptor || {}).filter(([, value]) =>
      Boolean(value?.trim()),
    ),
  ) as ElementDescriptionDescriptor;
}

function mentionsTemporaryAnnotation(value?: string): boolean {
  if (!value) {
    return false;
  }

  return /红框|标注|标记|选区|选择框|临时标识|准星|callout|marker|annotation|crosshair|selection box|red rectangle|temporary overlay/i.test(
    value,
  )
    ? true
    : /(?:red|blue)\s+(?:marker|box|rectangle|dot|ring|line|border|callout)|(?:红色|蓝色).*(?:框|点|线|圈|标注|标记)/i.test(
        value,
      );
}

function sanitizeDiagnosticInstruction(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || mentionsTemporaryAnnotation(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function clampCropAroundPoint(
  center: [number, number],
  imageSize: Size,
  cropSize = VISUAL_DIAGNOSTIC_CENTER_CROP_SIZE,
): Rect {
  const width = Math.min(cropSize, imageSize.width);
  const height = Math.min(cropSize, imageSize.height);
  const maxLeft = Math.max(0, imageSize.width - width);
  const maxTop = Math.max(0, imageSize.height - height);
  return {
    left: Math.max(0, Math.min(Math.round(center[0] - width / 2), maxLeft)),
    top: Math.max(0, Math.min(Math.round(center[1] - height / 2), maxTop)),
    width,
    height,
  };
}

function normalizeVisualDiagnosticResult(
  result: DescribeElementVisualDiagnosticResult | undefined,
): DescribeElementVisualDiagnosticResult | undefined {
  if (!result?.failureType) {
    return undefined;
  }
  return {
    failureType: result.failureType,
    confidence:
      typeof result.confidence === 'number' &&
      Number.isFinite(result.confidence)
        ? Math.max(0, Math.min(1, result.confidence))
        : undefined,
    centerPrimitive: result.centerPrimitive,
    glyph: result.glyph?.trim() || undefined,
    primitiveEvidence: result.primitiveEvidence?.trim() || undefined,
    wrongMatchSummary: result.wrongMatchSummary?.trim() || undefined,
    describeInstruction: sanitizeDiagnosticInstruction(
      result.describeInstruction,
    ),
    locateInstruction: sanitizeDiagnosticInstruction(result.locateInstruction),
    isPrimitiveConsistentWithContext:
      typeof result.isPrimitiveConsistentWithContext === 'boolean'
        ? result.isPrimitiveConsistentWithContext
        : undefined,
    uncertaintyReason: result.uncertaintyReason?.trim() || undefined,
  };
}

function shouldApplyVisualDiagnosticFeedback(
  result: DescribeElementVisualDiagnosticResult,
): boolean {
  return (
    result.failureType !== 'unknown' &&
    (result.confidence ?? 0) >= VISUAL_DIAGNOSTIC_MIN_CONFIDENCE &&
    result.centerPrimitive !== 'unknown' &&
    result.isPrimitiveConsistentWithContext !== false
  );
}

async function buildDiagnosticScreenshot(input: {
  screenshotBase64: string;
  shotSize: Size;
  targetMarker: DescribeTargetMarker;
  verifyResult?: LocateValidatorResult;
}): Promise<{ imageBase64: string; hasLocatorMarker: boolean }> {
  let imageBase64 = Array.isArray(input.targetMarker)
    ? await compositePointMarkerImg({
        inputImgBase64: input.screenshotBase64,
        size: input.shotSize,
        point: {
          x: input.targetMarker[0],
          y: input.targetMarker[1],
        },
        indexId: 1,
      })
    : await compositeElementInfoImg({
        inputImgBase64: input.screenshotBase64,
        size: input.shotSize,
        elementsPositionInfo: [
          {
            rect: getDescribeMarkerRect(input.targetMarker),
            indexId: 1,
          },
        ],
        borderThickness: getDescribeMarkerBorderThickness(input.targetMarker),
        centerPoint: true,
      });

  if (!input.verifyResult?.center) {
    return { imageBase64, hasLocatorMarker: false };
  }

  imageBase64 = await compositePointMarkerImg({
    inputImgBase64: imageBase64,
    size: input.shotSize,
    point: {
      x: input.verifyResult.center[0],
      y: input.verifyResult.center[1],
    },
    indexId: 2,
  });

  return { imageBase64, hasLocatorMarker: true };
}

async function buildDescribeRetryDiagnosticFeedback(
  runtime: Pick<ElementDescriberRuntime, 'describeModelRuntime'>,
  input: {
    prompt: string;
    descriptor?: ElementDescriptionDescriptor;
    screenshotContext?: UIContext;
    expectCenter: [number, number];
    targetMarker: DescribeTargetMarker;
    verifyResult?: LocateValidatorResult;
    error?: string;
  },
): Promise<
  | {
      feedback?: string;
      diagnostic?: DescribeElementVisualDiagnosticResult;
    }
  | undefined
> {
  if (!input.screenshotContext) {
    return undefined;
  }

  const screenshotBase64 = input.screenshotContext.screenshot.base64;
  const shotSize = input.screenshotContext.shotSize;
  const centerCropRect = clampCropAroundPoint(input.expectCenter, shotSize);
  const verifySummary = input.verifyResult
    ? {
        pass: input.verifyResult.pass,
        locatedCenter: input.verifyResult.center,
        locatedRect: input.verifyResult.rect,
        centerDistance: input.verifyResult.centerDistance,
        includedInRect: input.verifyResult.includedInRect,
      }
    : undefined;

  try {
    const diagnosticScreenshot = await buildDiagnosticScreenshot({
      screenshotBase64,
      shotSize,
      targetMarker: input.targetMarker,
      verifyResult: input.verifyResult,
    });
    const rawCenterCrop = await cropByRect(screenshotBase64, centerCropRect);
    const messages = buildDescribeRetryDiagnosticPrompt({
      previousDescription: input.prompt,
      previousStructuredDescriptor: input.descriptor,
      verifierResult: verifySummary,
      verifierError: input.error,
      diagnosticScreenshotBase64: diagnosticScreenshot.imageBase64,
      rawCenterCropBase64: rawCenterCrop.imageBase64,
      hasLocatorMarker: diagnosticScreenshot.hasLocatorMarker,
    });

    const result =
      await callAIWithObjectResponse<DescribeElementVisualDiagnosticResult>(
        messages,
        runtime.describeModelRuntime,
      );
    const diagnostic = normalizeVisualDiagnosticResult(result.content);
    if (!diagnostic || result.content.error) {
      return undefined;
    }
    return {
      diagnostic,
      feedback: shouldApplyVisualDiagnosticFeedback(diagnostic)
        ? buildDiagnosticRetryHint(diagnostic)
        : undefined,
    };
  } catch {
    return undefined;
  }
}

export async function describeElementAtPoint(
  runtime: ElementDescriberRuntime,
  center: [number, number],
  opt?: DescribeElementAtPointOptions,
): Promise<AgentDescribeElementAtPointResult> {
  const { verifyPrompt = true, retryLimit = 4 } = opt || {};
  const retryStrategy = normalizeDescribeRetryStrategy(opt?.retryStrategy);
  const { screenshotContext, locateOpt, targetCenter, targetRect } =
    await createScreenshotBoundLocatorContext(center, opt);
  const describeTarget = targetRect ?? targetCenter;

  let success = false;
  let retryCount = 0;
  let resultPrompt = '';
  let descriptor: ElementDescriptionDescriptor | undefined;
  let deepLocate = opt?.deepLocate || false;
  let verifyResult: LocateValidatorResult | undefined;
  let lastError: string | undefined;
  let failureStage: AgentDescribeElementAtPointResult['failureStage'];
  let describeFeedback: string | undefined;
  let visualDiagnostic: DescribeElementVisualDiagnosticResult | undefined;

  while (!success && retryCount < retryLimit) {
    if (retryCount >= 1) {
      deepLocate = true;
    }
    const describeModelRuntime = runtime.describeModelRuntime;
    const locateModelRuntime = runtime.locateModelRuntime;
    const retryRuntime: ElementDescriberRuntime = {
      ...runtime,
      describeModelRuntime,
      locateModelRuntime,
    };
    const describeOpt: ServiceDescribeOptions = screenshotContext
      ? {
          deepLocate,
          context: screenshotContext,
          feedback: describeFeedback,
        }
      : {
          deepLocate,
          feedback: describeFeedback,
        };
    let text: Awaited<
      ReturnType<ElementDescriberRuntime['service']['describe']>
    >;
    try {
      text = await retryRuntime.service.describe(
        describeTarget,
        retryRuntime.describeModelRuntime,
        describeOpt,
      );
    } catch (error) {
      return {
        prompt: resultPrompt,
        deepLocate,
        verifyResult,
        retryStrategy,
        visualDiagnostic,
        ...compactDescriptionDescriptor(descriptor),
        success: false,
        error: errorMessage(error),
        failureStage: 'describe',
      };
    }
    if (!text.description) {
      return {
        prompt: resultPrompt,
        deepLocate,
        verifyResult,
        retryStrategy,
        visualDiagnostic,
        ...compactDescriptionDescriptor(descriptor),
        success: false,
        error: `failed to describe element at [${targetCenter}]`,
        failureStage: 'describe',
      };
    }
    resultPrompt = text.description;
    descriptor = compactDescriptionDescriptor({
      target: text.target?.trim(),
      primitive: text.primitive?.trim(),
      owner: text.owner?.trim(),
      disambiguator: text.disambiguator?.trim(),
      context: text.context?.trim(),
    });
    if (!verifyPrompt) {
      opt?.onProgress?.({
        prompt: resultPrompt,
        deepLocate,
        visualDiagnostic,
      });
      success = true;
      break;
    }

    let failedVerifyResult: LocateValidatorResult | undefined;
    let failedError: string | undefined;
    try {
      const candidateVerifyResult = await verifyLocator(
        retryRuntime,
        resultPrompt,
        locateOpt,
        targetCenter,
        {
          ...opt,
          deepLocate,
          tightLocate: true,
          descriptor,
          locateInstruction: visualDiagnostic?.locateInstruction,
        },
      );
      verifyResult = applyLocatorVerifyFn(opt?.locatorVerifyFn, {
        prompt: resultPrompt,
        expectCenter: targetCenter,
        deepLocate,
        retryCount,
        verifyResult: candidateVerifyResult,
      });
      opt?.onProgress?.({
        prompt: resultPrompt,
        deepLocate,
        visualDiagnostic,
        verifyResult,
      });
      if (verifyResult.pass) {
        success = true;
        break;
      }
      lastError = undefined;
      failedVerifyResult = verifyResult;
      failureStage = 'verify';
    } catch (error) {
      lastError = errorMessage(error);
      failedError = lastError;
      failureStage = 'verify';
      opt?.onProgress?.({
        prompt: resultPrompt,
        deepLocate,
        visualDiagnostic,
      });
    }

    if (!success && retryCount + 1 < retryLimit) {
      let diagnosticFeedback:
        | Awaited<ReturnType<typeof buildDescribeRetryDiagnosticFeedback>>
        | undefined;
      if (retryStrategy === 'diagnostic') {
        diagnosticFeedback = await buildDescribeRetryDiagnosticFeedback(
          retryRuntime,
          {
            prompt: resultPrompt,
            descriptor,
            screenshotContext,
            expectCenter: targetCenter,
            targetMarker: describeTarget,
            verifyResult: failedVerifyResult,
            error: failedError || lastError,
          },
        );
        visualDiagnostic = diagnosticFeedback?.diagnostic;
      }
      describeFeedback =
        retryStrategy === 'diagnostic'
          ? diagnosticFeedback?.feedback
          : undefined;
    }
    retryCount++;
  }

  return {
    prompt: resultPrompt,
    deepLocate,
    retryStrategy,
    visualDiagnostic,
    ...compactDescriptionDescriptor(descriptor),
    verifyResult,
    success,
    error:
      success || !verifyPrompt
        ? undefined
        : lastError || 'describeElementAtPoint verify failed',
    failureStage: success ? undefined : failureStage,
  };
}

export async function verifyElementDescriptionAtPoint(
  runtime: ElementDescriberRuntime,
  description: string,
  center: [number, number],
  opt?: VerifyElementDescriptionAtPointOptions,
): Promise<LocateValidatorResult> {
  assert(description?.trim(), 'description must not be empty');
  const { locateOpt, targetCenter } = await createScreenshotBoundLocatorContext(
    center,
    opt,
  );

  return verifyLocator(runtime, description, locateOpt, targetCenter, opt);
}

export async function verifyElementByServiceLocate(
  runtime: Pick<ElementDescriberRuntime, 'service' | 'locateModelRuntime'>,
  description: string,
  center: [number, number],
  opt?: VerifyElementByServiceLocateOptions,
): Promise<LocateValidatorResult> {
  return locateAndVerify(runtime, description, center, opt);
}

async function locateAndVerify(
  runtime: Pick<ElementDescriberRuntime, 'service' | 'locateModelRuntime'>,
  description: string,
  center: [number, number],
  opt?: VerifyElementByServiceLocateOptions & {
    uiContext?: UIContext;
    tightLocate?: boolean;
    descriptor?: ElementDescriptionDescriptor;
    locateInstruction?: string;
  },
): Promise<LocateValidatorResult> {
  assert(description?.trim(), 'description must not be empty');
  const { screenshotContext, targetCenter } =
    await createScreenshotBoundLocatorContext(center, opt);
  const context = opt?.uiContext || screenshotContext;
  const locateDescription = opt?.tightLocate
    ? buildStructuredLocatePrompt(
        description,
        opt.descriptor,
        opt.locateInstruction,
      )
    : description;
  const locateParam = buildDetailedLocateParam(locateDescription, {
    cacheable: opt?.cacheable,
    deepLocate: opt?.deepLocate,
    xpath: opt?.xpath,
  });
  assert(locateParam, 'cannot get locate param for service locate');

  const locateResult = await runtime.service.locate(
    locateParam,
    context ? { context } : {},
    runtime.locateModelRuntime,
    opt?.abortSignal,
  );
  assert(locateResult.element, `Element not found: ${description}`);
  const verifyResult = buildLocateValidatorResult(
    targetCenter,
    locateResult.element,
    opt,
  );
  return verifyResult;
}
