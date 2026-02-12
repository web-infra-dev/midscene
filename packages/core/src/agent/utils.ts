import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type {
  ElementCacheFeature,
  LocateResultElement,
  PlanningLocateParam,
  Rect,
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
  _opt: { uploadServerUrl?: string },
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

  debug('will get size');
  const interfaceSize = await interfaceInstance.size();
  const { width: logicalWidth, height: logicalHeight } = interfaceSize;

  if ((interfaceSize as unknown as { dpr: number }).dpr) {
    console.warn(
      'Warning: return value of interface.size() include a dpr property, which is not expected and ignored. ',
    );
  }

  if (!Number.isFinite(logicalWidth) || !Number.isFinite(logicalHeight)) {
    throw new Error(
      `Invalid interface size: width and height must be finite numbers. Received width: ${logicalWidth}, height: ${logicalHeight}`,
    );
  }
  debug(`size: ${logicalWidth}x${logicalHeight}`);

  const screenshotBase64 = await interfaceInstance.screenshotBase64();
  assert(screenshotBase64!, 'screenshotBase64 is required');

  // Get physical screenshot dimensions
  debug('will get screenshot dimensions');
  const { width: imgWidth, height: imgHeight } =
    await imageInfoOfBase64(screenshotBase64);
  debug('screenshot dimensions', imgWidth, 'x', imgHeight);

  const shrinkFactor = imgWidth / logicalWidth;

  debug('calculated shrink factor:', shrinkFactor);

  if (shrinkFactor !== 1) {
    const targetWidth = Math.round(imgWidth / shrinkFactor);
    const targetHeight = Math.round(imgHeight / shrinkFactor);

    debug(
      `Applying screenshot shrink factor: ${shrinkFactor} (physical: ${imgWidth}x${imgHeight} -> target: ${targetWidth}x${targetHeight})`,
    );

    const resizedBase64 = await resizeImgBase64(screenshotBase64, {
      width: targetWidth,
      height: targetHeight,
    });
    return {
      shotSize: {
        width: targetWidth,
        height: targetHeight,
      },
      deprecatedDpr: shrinkFactor,
      screenshot: ScreenshotItem.create(resizedBase64),
    };
  }
  return {
    shotSize: {
      width: imgWidth,
      height: imgHeight,
    },
    deprecatedDpr: 1,
    screenshot: ScreenshotItem.create(screenshotBase64),
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

/**
 * Transform coordinates from screenshot coordinate system to logical coordinate system.
 * When shrunkShotToLogicalRatio > 1, the screenshot is larger than logical size,
 * so we need to divide coordinates by shrunkShotToLogicalRatio.
 *
 * @param element - The locate result element with coordinates in screenshot space
 * @param shrunkShotToLogicalRatio - The ratio of screenshot size to logical size
 * @returns A new element with coordinates transformed to logical space
 */
export const transformScreenshotElementToLogical = (
  element: LocateResultElement,
  shrunkShotToLogicalRatio: number,
): LocateResultElement => {
  if (shrunkShotToLogicalRatio === 1) {
    return element;
  }

  return {
    ...element,
    center: [
      Math.round(element.center[0] / shrunkShotToLogicalRatio),
      Math.round(element.center[1] / shrunkShotToLogicalRatio),
    ],
    rect: {
      ...element.rect,
      left: Math.round(element.rect.left / shrunkShotToLogicalRatio),
      top: Math.round(element.rect.top / shrunkShotToLogicalRatio),
      width: Math.round(element.rect.width / shrunkShotToLogicalRatio),
      height: Math.round(element.rect.height / shrunkShotToLogicalRatio),
    },
  };
};

export const transformLogicalElementToScreenshot = (
  element: LocateResultElement,
  shrunkShotToLogicalRatio: number,
): LocateResultElement => {
  if (shrunkShotToLogicalRatio === 1) {
    return element;
  }

  return {
    ...element,
    center: [
      Math.round(element.center[0] * shrunkShotToLogicalRatio),
      Math.round(element.center[1] * shrunkShotToLogicalRatio),
    ],
    rect: {
      ...element.rect,
      left: Math.round(element.rect.left * shrunkShotToLogicalRatio),
      top: Math.round(element.rect.top * shrunkShotToLogicalRatio),
      width: Math.round(element.rect.width * shrunkShotToLogicalRatio),
      height: Math.round(element.rect.height * shrunkShotToLogicalRatio),
    },
  };
};

export const transformLogicalRectToScreenshotRect = (
  rect: Rect,
  shrunkShotToLogicalRatio: number,
): Rect => {
  if (shrunkShotToLogicalRatio === 1) {
    return rect;
  }

  return {
    ...rect,
    left: Math.round(rect.left * shrunkShotToLogicalRatio),
    top: Math.round(rect.top * shrunkShotToLogicalRatio),
    width: Math.round(rect.width * shrunkShotToLogicalRatio),
    height: Math.round(rect.height * shrunkShotToLogicalRatio),
  };
};
