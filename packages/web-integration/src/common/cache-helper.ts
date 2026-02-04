import type { ElementCacheFeature, Point, Rect } from '@midscene/core';
import {
  AiJudgeOrderSensitive,
  callAIWithObjectResponse,
} from '@midscene/core/ai-model';
import type { IModelConfig } from '@midscene/shared/env';
import type { DebugFunction } from '@midscene/shared/logger';

// Shared type for web element cache feature
export type WebElementCacheFeature = ElementCacheFeature & {
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

// Cache feature extraction options interface
export interface CacheFeatureOptions {
  targetDescription?: string;
  modelConfig?: IModelConfig;
}

// Shared logic for judging isOrderSensitive
export async function judgeOrderSensitive(
  options: CacheFeatureOptions | undefined,
  debug: DebugFunction,
): Promise<boolean> {
  if (!options?.targetDescription || !options?.modelConfig) {
    return false;
  }
  try {
    const judgeResult = await AiJudgeOrderSensitive(
      options.targetDescription,
      callAIWithObjectResponse,
      options.modelConfig,
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
export function buildRectFromElementInfo(
  elementInfo: {
    rect: { left: number; top: number; width: number; height: number };
  },
  dpr?: number,
): Rect {
  const matchedRect: Rect = {
    left: elementInfo.rect.left,
    top: elementInfo.rect.top,
    width: elementInfo.rect.width,
    height: elementInfo.rect.height,
  };
  if (dpr) {
    matchedRect.dpr = dpr;
  }
  return matchedRect;
}
