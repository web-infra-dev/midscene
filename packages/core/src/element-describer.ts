import type { ModelRuntime } from '@/ai-model/models';
import { assert } from '@midscene/shared/utils';
import { createScreenshotBoundUIContext } from './agent/utils';
import type Service from './service';
import type {
  AgentDescribeElementAtPointResult,
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

export type DescribeElementAtPointOptions = {
  verifyPrompt?: boolean;
  retryLimit?: number;
  deepLocate?: boolean;
  locatorVerifyFn?: LocatorVerifyFn;
  screenshotBase64?: string;
  screenshotSize?: Size;
  coordinateSpace?: DescribeElementCoordinateSpace;
  logicalSize?: Size;
  onProgress?: (progress: {
    prompt?: string;
    deepLocate?: boolean;
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

const createScreenshotBoundLocatorContext = async (
  center: [number, number],
  opt?: ScreenshotBoundContextOptions,
): Promise<{
  screenshotContext?: UIContext;
  locateOpt?: LocateOption;
  targetCenter: [number, number];
}> => {
  const screenshotContext = opt?.screenshotBase64
    ? await createScreenshotBoundUIContext(opt.screenshotBase64, opt)
    : undefined;
  const targetCenter = screenshotContext
    ? mapPointToScreenshotSpace(center, screenshotContext.shotSize, opt || {})
    : center;
  return {
    screenshotContext,
    locateOpt: screenshotContext ? { uiContext: screenshotContext } : undefined,
    targetCenter,
  };
};

export async function verifyLocator(
  runtime: Pick<ElementDescriberRuntime, 'service' | 'locateModelRuntime'>,
  prompt: string,
  locateOpt: LocateOption | undefined,
  expectCenter: [number, number],
  verifyLocateOption?: LocatorValidatorOption,
): Promise<LocateValidatorResult> {
  return locateAndVerify(runtime, prompt, expectCenter, {
    centerDistanceThreshold: verifyLocateOption?.centerDistanceThreshold,
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

export async function describeElementAtPoint(
  runtime: ElementDescriberRuntime,
  center: [number, number],
  opt?: DescribeElementAtPointOptions,
): Promise<AgentDescribeElementAtPointResult> {
  const { verifyPrompt = true, retryLimit = 3 } = opt || {};
  const { screenshotContext, locateOpt, targetCenter } =
    await createScreenshotBoundLocatorContext(center, opt);

  let success = false;
  let retryCount = 0;
  let resultPrompt = '';
  let deepLocate = opt?.deepLocate || false;
  let verifyResult: LocateValidatorResult | undefined;
  let lastError: string | undefined;
  let failureStage: AgentDescribeElementAtPointResult['failureStage'];

  while (!success && retryCount < retryLimit) {
    if (retryCount >= 2) {
      deepLocate = true;
    }
    const describeOpt = screenshotContext
      ? { deepLocate, context: screenshotContext }
      : { deepLocate };

    let text: Awaited<
      ReturnType<ElementDescriberRuntime['service']['describe']>
    >;
    try {
      text = await runtime.service.describe(
        targetCenter,
        runtime.describeModelRuntime,
        describeOpt,
      );
    } catch (error) {
      return {
        prompt: resultPrompt,
        deepLocate,
        verifyResult,
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
        success: false,
        error: `failed to describe element at [${targetCenter}]`,
        failureStage: 'describe',
      };
    }
    resultPrompt = text.description;

    if (!verifyPrompt) {
      opt?.onProgress?.({ prompt: resultPrompt, deepLocate });
      success = true;
      break;
    }

    try {
      verifyResult = await verifyLocator(
        runtime,
        resultPrompt,
        locateOpt,
        targetCenter,
        opt,
      );
      verifyResult = applyLocatorVerifyFn(opt?.locatorVerifyFn, {
        prompt: resultPrompt,
        expectCenter: targetCenter,
        deepLocate,
        retryCount,
        verifyResult,
      });
      opt?.onProgress?.({ prompt: resultPrompt, deepLocate, verifyResult });
      if (verifyResult.pass) {
        success = true;
      } else {
        lastError = undefined;
        failureStage = 'verify';
        retryCount++;
      }
    } catch (error) {
      lastError = errorMessage(error);
      failureStage = 'verify';
      opt?.onProgress?.({ prompt: resultPrompt, deepLocate });
      retryCount++;
    }
  }

  return {
    prompt: resultPrompt,
    deepLocate,
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
  opt?: VerifyElementByServiceLocateOptions & { uiContext?: UIContext },
): Promise<LocateValidatorResult> {
  assert(description?.trim(), 'description must not be empty');
  const { screenshotContext, targetCenter } =
    await createScreenshotBoundLocatorContext(center, opt);
  const context = opt?.uiContext || screenshotContext;
  const locateParam = buildDetailedLocateParam(description, {
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
  return buildLocateValidatorResult(targetCenter, locateResult.element, opt);
}
