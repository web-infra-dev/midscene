import type { TMultimodalPrompt, TUserPrompt } from '@/ai-model/common';
import type { AbstractInterface } from '@/device';
import type {
  ElementCacheFeature,
  LocateResultElement,
  PlanningLocateParam,
  UIContext,
} from '@/types';
import { uploadTestInfoToServer } from '@/utils';
import {
  MIDSCENE_REPORT_TAG_NAME,
  globalConfigManager,
} from '@midscene/shared/env';
import { generateElementByPosition } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';
import { assert, logMsg, uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';
import type { TaskCache } from './task-cache';
import { debug as cacheDebug } from './task-cache';

const debugProfile = getDebug('web:tool:profile');

export async function commonContextParser(
  interfaceInstance: AbstractInterface,
  _opt: { uploadServerUrl?: string },
): Promise<UIContext> {
  assert(interfaceInstance, 'interfaceInstance is required');

  debugProfile('Getting interface description');
  const description = interfaceInstance.describe?.() || '';
  debugProfile('Interface description end');

  debugProfile('Uploading test info to server');
  uploadTestInfoToServer({
    testUrl: description,
    serverUrl: _opt.uploadServerUrl,
  });
  debugProfile('UploadTestInfoToServer end');

  const screenshotBase64 = await interfaceInstance.screenshotBase64();
  assert(screenshotBase64!, 'screenshotBase64 is required');

  const size = await interfaceInstance.size();
  debugProfile(`size: ${size.width}x${size.height} dpr: ${size.dpr}`);

  return {
    size,
    screenshotBase64: screenshotBase64!,
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

export function matchElementFromPlan(
  planLocateParam: PlanningLocateParam,
): LocateResultElement | undefined {
  if (!planLocateParam) {
    return undefined;
  }

  if (planLocateParam.bbox) {
    const centerPosition = {
      x: Math.floor((planLocateParam.bbox[0] + planLocateParam.bbox[2]) / 2),
      y: Math.floor((planLocateParam.bbox[1] + planLocateParam.bbox[3]) / 2),
    };

    const element = generateElementByPosition(centerPosition);
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
      id: uuid(),
      center: [
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      ],
      rect,
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
