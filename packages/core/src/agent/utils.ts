import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type {
  ElementCacheFeature,
  LocateResultElement,
  PlanningLocateParam,
  UIContext,
} from '@/types';
import { uploadTestInfoToServer } from '@/utils';
import {
  MIDSCENE_REPORT_QUIET,
  MIDSCENE_REPORT_TAG_NAME,
  globalConfigManager,
} from '@midscene/shared/env';
import { generateElementByRect } from '@midscene/shared/extractor';
import { imageInfoOfBase64, resizeImgBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { assert, logMsg, uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';
import type { TaskCache } from './task-cache';
import { debug as cacheDebug } from './task-cache';

export async function commonContextParser(
  interfaceInstance: AbstractInterface,
  _opt: { uploadServerUrl?: string; screenshotShrinkFactor?: number },
): Promise<UIContext> {
  const debug = getDebug('commonContextParser');

  assert(interfaceInstance, 'interfaceInstance is required');

  debug('Getting interface description');
  const description = interfaceInstance.describe?.() || '';
  debug('Interface description end');

  debug('Uploading test info to server');
  uploadTestInfoToServer({
    testUrl: description,
    serverUrl: _opt.uploadServerUrl,
  });
  debug('UploadTestInfoToServer end');

  const screenshotBase64 = await interfaceInstance.screenshotBase64();
  assert(screenshotBase64!, 'screenshotBase64 is required');

  debug('will get size');
  const logicalSize = await interfaceInstance.size();
  debug(
    `size: ${logicalSize.width}x${logicalSize.height} dpr: ${logicalSize.dpr}`,
  );

  // Get physical screenshot dimensions
  debug('will get screenshot dimensions');
  const { width: imgWidth, height: imgHeight } =
    await imageInfoOfBase64(screenshotBase64);

  debug('screenshot dimensions', imgWidth, 'x', imgHeight);

  // Validate user-specified shrink factor
  const userShrinkFactor = _opt.screenshotShrinkFactor ?? 1;

  if (userShrinkFactor < 1) {
    throw new Error(
      `screenshotShrinkFactor must be >= 1, but got ${userShrinkFactor}. Enlarging screenshots are not supported.`,
    );
  }

  if (!logicalSize.dpr) {
    throw new Error(
      'Device pixel ratio (dpr) is not available in context size, cannot apply screenshot shrink factor correctly',
    );
  }

  const shrunkShotToLogicalRatio = logicalSize.dpr / userShrinkFactor;

  debug('shrunkShotToLogicalRatio', shrunkShotToLogicalRatio);

  const targetWidth = Math.round(imgWidth / userShrinkFactor);
  const targetHeight = Math.round(imgHeight / userShrinkFactor);

  debug(
    `Applying screenshot shrink factor: ${userShrinkFactor} (physical: ${imgWidth}x${imgHeight} -> target: ${targetWidth}x${targetHeight})`,
  );

  const screenshot = await (async () => {
    if (userShrinkFactor !== 1) {
      const resizedBase64 = await resizeImgBase64(screenshotBase64, {
        width: targetWidth,
        height: targetHeight,
      });
      return ScreenshotItem.create(resizedBase64);
    }
    return ScreenshotItem.create(screenshotBase64);
  })();

  return {
    shotSize: {
      width: targetWidth,
      height: targetHeight,
      // shotSize should not have dpr because it is the size of the screenshot, not the logical size
      dpr: undefined,
    },
    screenshot,
    shrunkShotToLogicalRatio,
  };
}

export function getReportFileName(tag = 'web') {
  const reportTagName = globalConfigManager.getEnvConfigValue(
    MIDSCENE_REPORT_TAG_NAME,
  );
  const dateTimeInFileName = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  // ensure uniqueness at the same time
  const uniqueId = uuid().substring(0, 8);
  return `${reportTagName || tag}-${dateTimeInFileName}-${uniqueId}`;
}

export function printReportMsg(filepath: string) {
  if (globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET)) {
    return;
  }
  logMsg(`Midscene - report file updated: ${filepath}`);
}

/**
 * Get the current execution file name
 * @returns The name of the current execution file
 */
export function getCurrentExecutionFile(trace?: string): string | false {
  const error = new Error();
  const stackTrace = trace || error.stack;
  const pkgDir = process.cwd() || '';
  if (stackTrace) {
    const stackLines = stackTrace.split('\n');
    for (const line of stackLines) {
      if (
        line.includes('.spec.') ||
        line.includes('.test.') ||
        line.includes('.ts') ||
        line.includes('.js')
      ) {
        const match = line.match(/(?:at\s+)?(.*?\.(?:spec|test)\.[jt]s)/);
        if (match?.[1]) {
          const targetFileName = match[1]
            .replace(pkgDir, '')
            .trim()
            .replace('at ', '');
          return targetFileName;
        }
      }
    }
  }
  return false;
}

const testFileIndex = new Map<string, number>();

export function generateCacheId(fileName?: string): string {
  let taskFile = fileName || getCurrentExecutionFile();
  if (!taskFile) {
    taskFile = uuid();
    console.warn(
      'Midscene - using random UUID for cache id. Cache may be invalid.',
    );
  }

  if (testFileIndex.has(taskFile)) {
    const currentIndex = testFileIndex.get(taskFile);
    if (currentIndex !== undefined) {
      testFileIndex.set(taskFile, currentIndex + 1);
    }
  } else {
    testFileIndex.set(taskFile, 1);
  }
  return `${taskFile}-${testFileIndex.get(taskFile)}`;
}

export function ifPlanLocateParamIsBbox(
  planLocateParam: PlanningLocateParam,
): boolean {
  return !!(
    planLocateParam.bbox &&
    Array.isArray(planLocateParam.bbox) &&
    planLocateParam.bbox.length === 4
  );
}

export function matchElementFromPlan(
  planLocateParam: PlanningLocateParam,
): LocateResultElement | undefined {
  if (!planLocateParam) {
    return undefined;
  }

  if (planLocateParam.bbox) {
    // Convert bbox [x1, y1, x2, y2] to rect {left, top, width, height}
    const rect = {
      left: planLocateParam.bbox[0],
      top: planLocateParam.bbox[1],
      width: planLocateParam.bbox[2] - planLocateParam.bbox[0] + 1,
      height: planLocateParam.bbox[3] - planLocateParam.bbox[1] + 1,
    };

    const element = generateElementByRect(
      rect,
      typeof planLocateParam.prompt === 'string'
        ? planLocateParam.prompt
        : planLocateParam.prompt?.prompt || '',
    );
    return element;
  }

  return undefined;
}

export async function matchElementFromCache(
  context: {
    taskCache?: TaskCache;
    interfaceInstance: AbstractInterface;
  },
  cacheEntry: ElementCacheFeature | undefined,
  cachePrompt: TUserPrompt,
  cacheable: boolean | undefined,
): Promise<LocateResultElement | undefined> {
  if (!cacheEntry) {
    return undefined;
  }

  if (cacheable === false) {
    cacheDebug('cache disabled for prompt: %s', cachePrompt);
    return undefined;
  }

  if (!context.taskCache?.isCacheResultUsed) {
    return undefined;
  }

  if (!context.interfaceInstance.rectMatchesCacheFeature) {
    cacheDebug(
      'interface does not implement rectMatchesCacheFeature, skip cache',
    );
    return undefined;
  }

  try {
    const rect =
      await context.interfaceInstance.rectMatchesCacheFeature(cacheEntry);
    const element: LocateResultElement = {
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      rect,
      description:
        typeof cachePrompt === 'string'
          ? cachePrompt
          : cachePrompt.prompt || '',
    };

    cacheDebug('cache hit, prompt: %s', cachePrompt);
    return element;
  } catch (error) {
    cacheDebug('rectMatchesCacheFeature error: %s', error);
    return undefined;
  }
}

declare const __VERSION__: string | undefined;

export const getMidsceneVersion = (): string => {
  if (typeof __VERSION__ !== 'undefined') {
    return __VERSION__;
  } else if (
    process.env.__VERSION__ &&
    process.env.__VERSION__ !== 'undefined'
  ) {
    return process.env.__VERSION__;
  }
  throw new Error('__VERSION__ inject failed during build');
};

export const parsePrompt = (
  prompt: TUserPrompt,
): {
  textPrompt: string;
  multimodalPrompt?: TMultimodalPrompt;
} => {
  if (typeof prompt === 'string') {
    return {
      textPrompt: prompt,
      multimodalPrompt: undefined,
    };
  }
  return {
    textPrompt: prompt.prompt,
    multimodalPrompt: prompt.images
      ? {
          images: prompt.images,
          convertHttpImage2Base64: !!prompt.convertHttpImage2Base64,
        }
      : undefined,
  };
};
