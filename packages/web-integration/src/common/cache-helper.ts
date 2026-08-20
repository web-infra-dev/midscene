import type {
  ElementCacheFeature,
  LocatorTarget,
  Point,
  Rect,
} from '@midscene/core';
import { AiJudgeOrderSensitive } from '@midscene/core/ai-model';
import type { ModelRuntime } from '@midscene/core/ai-model';
import type { DebugFunction } from '@midscene/shared/logger';

// Shared type for web element cache feature
export type WebElementCacheFeature = ElementCacheFeature & {
  targets?: LocatorTarget[];
  /** @deprecated Read-only compatibility with caches written before target. */
  xpaths?: string[];
};

// Shared function to sanitize xpaths
export const sanitizeXpaths = (xpaths: unknown): string[] => {
  if (!Array.isArray(xpaths)) {
    return [];
  }

  return xpaths.filter(
    (xpath): xpath is string => typeof xpath === 'string' && xpath.length > 0,
  );
};

export const targetsFromXpaths = (xpaths: unknown): LocatorTarget[] =>
  sanitizeXpaths(xpaths).map((selector) => ({
    strategy: 'xpath',
    selector,
  }));

export const sanitizeLocatorTargets = (
  feature: WebElementCacheFeature,
): LocatorTarget[] => {
  if (Array.isArray(feature.targets)) {
    const targets = feature.targets.filter(
      (target): target is LocatorTarget =>
        target?.strategy === 'xpath' &&
        typeof target.selector === 'string' &&
        target.selector.length > 0,
    );
    if (targets.length > 0) return targets;
  }
  return targetsFromXpaths(feature.xpaths);
};

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
  const { left, top, width, height } = elementInfo.rect;
  if (
    [left, top, width, height].some(
      (value) => typeof value !== 'number' || !Number.isFinite(value),
    ) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `Element info contains an invalid rect: ${JSON.stringify(elementInfo.rect)}`,
    );
  }
  const matchedRect: Rect = {
    left,
    top,
    width,
    height,
  };
  return matchedRect;
}
