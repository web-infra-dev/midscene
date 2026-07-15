import { verifyCacheActionWithAI } from '@/ai-model/cache-action-verification';
import type { ModelRuntime } from '@/ai-model/models';
import { buildCacheActionVerificationDemand } from '@/ai-model/prompt/cache-action-verification';
import { AIResponseParseError } from '@/ai-model/service-caller';
import type { TUserPrompt } from '@/common';
import type { ScreenshotItem } from '@/screenshot-item';
import type Service from '@/service';
import { createServiceDump } from '@/service/utils';
import type {
  CacheActionVerificationModelInputImage,
  CacheActionVerificationResult,
  CacheActionVerificationStatus,
  Rect,
  ServiceDump,
  ServiceTaskInfo,
  UIContext,
} from '@/types';
import { ServiceError } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { createFocusedComparisonScreenshot } from './cache-action-verification-image';

const CACHE_ACTION_VERIFICATION_STATUSES =
  new Set<CacheActionVerificationStatus>(['passed', 'failed', 'uncertain']);
const warn = getDebug('cache-action-verifier', { console: true });

export interface CacheActionVerificationInput {
  actionName: string;
  targetDescription: string;
  beforeScreenshot: ScreenshotItem;
  afterContext: UIContext;
  targetRect?: Rect;
  abortSignal?: AbortSignal;
}

export interface CacheActionVerificationOutput {
  result: CacheActionVerificationResult;
  dump: ServiceDump;
  modelInputImages: CacheActionVerificationModelInputImage[];
}

type VerificationMode = 'focused-comparison' | 'full-frame';

interface VerificationAttempt {
  status: CacheActionVerificationStatus;
  reason: string;
  dataDemand: ReturnType<typeof buildCacheActionVerificationDemand>;
  dump: ServiceDump;
}

export class CacheActionVerificationError extends Error {
  constructor(
    readonly verification: CacheActionVerificationResult,
    readonly targetPrompts: TUserPrompt[],
  ) {
    super(
      `Cached action verification ${verification.status}: ${verification.reason}`,
    );
    this.name = 'CacheActionVerificationError';
  }
}

export function findCacheActionVerificationError(
  error: unknown,
): CacheActionVerificationError | undefined {
  const visited = new Set<object>();

  const findInErrorChain = (
    current: unknown,
  ): CacheActionVerificationError | undefined => {
    if (current instanceof CacheActionVerificationError) {
      return current;
    }
    if (!current || typeof current !== 'object' || visited.has(current)) {
      return undefined;
    }

    visited.add(current);
    const errorWithCause = current as {
      cause?: unknown;
      errorTask?: { error?: unknown };
    };
    return (
      findInErrorChain(errorWithCause.errorTask?.error) ||
      findInErrorChain(errorWithCause.cause)
    );
  };

  return findInErrorChain(error);
}

export async function verifyCacheActionEffect(
  service: Service,
  modelRuntime: ModelRuntime,
  input: CacheActionVerificationInput,
): Promise<CacheActionVerificationOutput> {
  const screenshotSequence = [
    input.beforeScreenshot,
    input.afterContext.screenshot,
  ];

  const runVerification = async (
    mode: VerificationMode,
    context: UIContext,
  ): Promise<VerificationAttempt> => {
    const dataDemand = buildCacheActionVerificationDemand({
      actionName: input.actionName,
      targetDescription: input.targetDescription,
      mode,
    });
    const screenshots =
      mode === 'focused-comparison' ? [context.screenshot] : screenshotSequence;
    const startTime = Date.now();
    let aiResult: Awaited<ReturnType<typeof verifyCacheActionWithAI>>;
    try {
      aiResult = await verifyCacheActionWithAI({
        mode,
        screenshots,
        dataDemand,
        modelRuntime,
        abortSignal: input.abortSignal,
      });
    } catch (error) {
      if (error instanceof AIResponseParseError) {
        const taskInfo: ServiceTaskInfo = {
          ...(service.taskInfo ?? {}),
          durationMs: Date.now() - startTime,
          rawResponse: error.rawResponse,
          rawChoiceMessage: error.rawChoiceMessage,
          usage: error.usage,
        };
        const dump = createServiceDump({
          type: 'extract',
          userQuery: { dataDemand },
          data: null,
          taskInfo,
          error: error.message,
        });
        throw new ServiceError(error.message, dump);
      }
      throw error;
    }

    const { data } = aiResult;
    const dump = createServiceDump({
      type: 'extract',
      userQuery: { dataDemand },
      data,
      taskInfo: {
        ...(service.taskInfo ?? {}),
        durationMs: Date.now() - startTime,
        rawResponse: aiResult.rawResponse,
        rawChoiceMessage: aiResult.rawChoiceMessage,
        formatResponse: { data },
        usage: aiResult.usage,
        reasoning_content: aiResult.reasoningContent,
      },
    });

    if (
      !data ||
      !CACHE_ACTION_VERIFICATION_STATUSES.has(data.status) ||
      typeof data.reason !== 'string' ||
      !data.reason.trim()
    ) {
      throw new Error(
        `Invalid cached action verification response: ${JSON.stringify(data)}`,
      );
    }

    return {
      status: data.status,
      reason: data.reason.trim(),
      dataDemand,
      dump,
    };
  };

  const runFullFrameVerification = async (
    fallbackReason:
      | 'target-rect-unavailable'
      | 'focused-image-error'
      | 'uncertain',
    previousModelInputImages: CacheActionVerificationModelInputImage[] = [],
    focusedComparison?: Awaited<
      ReturnType<typeof createFocusedComparisonScreenshot>
    >,
  ): Promise<CacheActionVerificationOutput> => {
    const requestIndex =
      previousModelInputImages.reduce(
        (maxIndex, image) => Math.max(maxIndex, image.requestIndex),
        0,
      ) + 1;
    const fullFrameModelInputImages: CacheActionVerificationModelInputImage[] =
      [
        {
          requestIndex,
          role: 'full-frame-before',
          screenshot: input.beforeScreenshot,
        },
        {
          requestIndex,
          role: 'full-frame-after',
          screenshot: input.afterContext.screenshot,
        },
      ];
    const modelInputImages = [
      ...previousModelInputImages,
      ...fullFrameModelInputImages,
    ];
    const attempt = await runVerification('full-frame', {
      ...input.afterContext,
      screenshotSequence,
    });
    return {
      result: {
        status: attempt.status,
        reason: attempt.reason,
        request: {
          actionName: input.actionName,
          targetDescription: input.targetDescription,
          logicalModelRequestCount: new Set(
            modelInputImages.map((image) => image.requestIndex),
          ).size,
          screenshotCount: screenshotSequence.length,
          modelInputImageCount: modelInputImages.length,
          verificationMode:
            fallbackReason === 'uncertain'
              ? 'focused-comparison-with-full-frame-fallback'
              : 'full-frame',
          fallbackReason,
          cropRect: focusedComparison?.cropRect,
          comparisonImageSize: focusedComparison?.comparisonImageSize,
          dataDemand: attempt.dataDemand,
        },
      },
      dump: attempt.dump,
      modelInputImages,
    };
  };

  if (!input.targetRect) {
    return runFullFrameVerification('target-rect-unavailable');
  }

  let focusedComparison: Awaited<
    ReturnType<typeof createFocusedComparisonScreenshot>
  >;
  try {
    focusedComparison = await createFocusedComparisonScreenshot(
      input.beforeScreenshot,
      input.afterContext.screenshot,
      input.targetRect,
    );
  } catch (error) {
    warn(
      `Failed to create focused cache verification image; falling back to full screenshots: ${error instanceof Error ? error.message : String(error)}`,
    );
    return runFullFrameVerification('focused-image-error');
  }

  const focusedAttempt = await runVerification('focused-comparison', {
    ...input.afterContext,
    screenshot: focusedComparison.screenshot,
    screenshotSequence: undefined,
  });
  const focusedModelInputImages: CacheActionVerificationModelInputImage[] = [
    {
      requestIndex: 1,
      role: 'focused-comparison',
      screenshot: focusedComparison.screenshot,
    },
  ];

  if (focusedAttempt.status === 'uncertain') {
    return runFullFrameVerification(
      'uncertain',
      focusedModelInputImages,
      focusedComparison,
    );
  }

  return {
    result: {
      status: focusedAttempt.status,
      reason: focusedAttempt.reason,
      request: {
        actionName: input.actionName,
        targetDescription: input.targetDescription,
        logicalModelRequestCount: 1,
        screenshotCount: screenshotSequence.length,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        cropRect: focusedComparison.cropRect,
        comparisonImageSize: focusedComparison.comparisonImageSize,
        dataDemand: focusedAttempt.dataDemand,
      },
    },
    dump: focusedAttempt.dump,
    modelInputImages: focusedModelInputImages,
  };
}
