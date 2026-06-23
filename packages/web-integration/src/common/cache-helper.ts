import type { ElementCacheFeature, Point, Rect } from '@midscene/core';
import { AiJudgeOrderSensitive } from '@midscene/core/ai-model';
import type { ModelRuntime } from '@midscene/core/ai-model';
import type { DebugFunction } from '@midscene/shared/logger';

// Shared type for web element cache feature
export type WebElementCacheFeature = ElementCacheFeature & {
  xpaths?: string[];
};

export interface CrossOriginIframeSignal {
  __crossOriginIframe: true;
  iframeXpath: string;
  translatedPoint: { left: number; top: number };
}

export type XpathsByPointResult = string[] | CrossOriginIframeSignal | null;

// Shared function to sanitize xpaths
export const sanitizeXpaths = (xpaths: unknown): string[] => {
  if (!Array.isArray(xpaths)) {
    return [];
  }

  return xpaths.filter(
    (xpath): xpath is string => typeof xpath === 'string' && xpath.length > 0,
  );
};

export function isCrossOriginIframeSignal(
  value: unknown,
): value is CrossOriginIframeSignal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const signal = value as Partial<CrossOriginIframeSignal>;
  return (
    signal.__crossOriginIframe === true &&
    typeof signal.iframeXpath === 'string' &&
    !!signal.translatedPoint &&
    typeof signal.translatedPoint.left === 'number' &&
    typeof signal.translatedPoint.top === 'number'
  );
}

// Cache feature extraction options interface
export interface CacheFeatureOptions {
  targetDescription?: string;
  modelRuntime?: ModelRuntime;
}

// Shared logic for judging isOrderSensitive
export async function judgeOrderSensitive(
  options: CacheFeatureOptions | undefined,
  debug: DebugFunction,
): Promise<boolean> {
  if (!options?.targetDescription || !options?.modelRuntime) {
    return false;
  }
  try {
    const judgeResult = await AiJudgeOrderSensitive(
      options.targetDescription,
      options.modelRuntime,
    );
    debug(
      'judged isOrderSensitive=%s for description: %s',
      judgeResult.isOrderSensitive,
      options.targetDescription,
    );
    return judgeResult.isOrderSensitive;
  } catch (error) {
    debug('Failed to judge isOrderSensitive: %O', error);
    return false;
  }
}

// Shared logic to build Rect from elementInfo
export function buildRectFromElementInfo(elementInfo: {
  rect: { left: number; top: number; width: number; height: number };
}): Rect {
  const matchedRect: Rect = {
    left: elementInfo.rect.left,
    top: elementInfo.rect.top,
    width: elementInfo.rect.width,
    height: elementInfo.rect.height,
  };
  return matchedRect;
}
