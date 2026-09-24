import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { writeCliScreenshotFile } from './screenshot-file';

export type CliVerboseScreenshotExportMode = 'none' | 'tmp' | 'report';

export interface CliVerboseScreenshotCollectOptions {
  reportFile?: unknown;
  exportMode?: CliVerboseScreenshotExportMode;
  cache?: Map<string, string>;
}

interface CliVerboseScreenshotRefLike {
  type: 'midscene_screenshot_ref';
  id?: unknown;
  mimeType?: unknown;
  storage?: unknown;
  path?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCliVerboseScreenshotRefLike(
  value: unknown,
): value is CliVerboseScreenshotRefLike {
  return isRecord(value) && value.type === 'midscene_screenshot_ref';
}

function toSerializableScreenshot(
  value: unknown,
): CliVerboseScreenshotRefLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeSerializable = value as {
    toSerializable?: () => unknown;
  };
  if (typeof maybeSerializable.toSerializable === 'function') {
    try {
      const serialized = maybeSerializable.toSerializable();
      return isCliVerboseScreenshotRefLike(serialized) ? serialized : null;
    } catch {
      return null;
    }
  }

  return isCliVerboseScreenshotRefLike(value) ? value : null;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  try {
    const property = value[key];
    return typeof property === 'string' && property.length > 0
      ? property
      : undefined;
  } catch {
    return undefined;
  }
}

function screenshotRawBase64(value: unknown): string | undefined {
  const rawBase64 = getStringProperty(value, 'rawBase64');
  if (rawBase64) {
    return rawBase64;
  }

  const base64 = getStringProperty(value, 'base64');
  const match = base64?.match(
    /^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/,
  );
  return match?.[1];
}

function inlineScreenshotCacheKey(
  rawBase64: string,
  serialized: CliVerboseScreenshotRefLike,
  directoryPath: string | undefined,
  directoryName: string | undefined,
  extension: string | undefined,
): string {
  return JSON.stringify([
    serialized.id,
    serialized.mimeType,
    directoryPath,
    directoryName,
    extension,
    rawBase64,
  ]);
}

function exportInlineScreenshotForVerbose(
  value: unknown,
  serialized: CliVerboseScreenshotRefLike,
  options: CliVerboseScreenshotCollectOptions,
): string | undefined {
  if (typeof serialized.path === 'string') {
    return serialized.path;
  }

  const exportMode = options.exportMode ?? 'tmp';
  if (exportMode === 'none') {
    return undefined;
  }

  const rawBase64 = screenshotRawBase64(value);
  if (!rawBase64) {
    return undefined;
  }

  const directoryPath =
    exportMode === 'report' &&
    typeof options.reportFile === 'string' &&
    options.reportFile.length > 0
      ? join(dirname(options.reportFile), 'screenshots')
      : undefined;
  const directoryName = directoryPath ? undefined : 'midscene-cli-screenshots';
  const extension = getStringProperty(value, 'extension');
  const cacheKey = inlineScreenshotCacheKey(
    rawBase64,
    serialized,
    directoryPath,
    directoryName,
    extension,
  );
  const cachedPath = options.cache?.get(cacheKey);
  if (cachedPath) {
    return cachedPath;
  }

  try {
    const path = writeCliScreenshotFile(rawBase64, {
      id: serialized.id,
      mimeType: serialized.mimeType,
      extension,
      ...(directoryPath ? { directoryPath } : { directoryName }),
      overwrite: false,
    });
    options.cache?.set(cacheKey, path);
    return path;
  } catch {
    return undefined;
  }
}

export function collectScreenshotRefs(
  value: unknown,
  options: CliVerboseScreenshotCollectOptions = {},
): Array<Record<string, unknown>> {
  const screenshots: Array<Record<string, unknown>> = [];
  const visit = (candidate: unknown, timing?: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item, timing);
      }
      return;
    }

    const serialized = toSerializableScreenshot(candidate);
    if (serialized?.type === 'midscene_screenshot_ref') {
      const screenshot: Record<string, unknown> = {
        id: serialized.id,
        storage: serialized.storage,
      };
      const exportedPath = exportInlineScreenshotForVerbose(
        candidate,
        serialized,
        options,
      );
      if (exportedPath) {
        screenshot.path = exportedPath;
        screenshot.file = basename(exportedPath);
      }
      if (typeof timing === 'string') {
        screenshot.timing = timing;
      }
      screenshots.push(screenshot);
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    const screenshotRecord = candidate.screenshot;
    if (screenshotRecord) {
      visit(screenshotRecord, candidate.timing);
    }
    if (candidate.recorder) {
      visit(candidate.recorder);
    }
    if (isRecord(candidate.uiContext)) {
      visit(candidate.uiContext.screenshot);
    }
  };

  visit(value);
  return screenshots;
}

export function pathForReportScreenshot(
  path: string,
  reportFile?: unknown,
): string {
  const resolvedPath =
    typeof reportFile === 'string' &&
    reportFile.length > 0 &&
    (path.startsWith('./') || path.startsWith('../'))
      ? join(dirname(reportFile), path)
      : path;

  if (!isAbsolute(resolvedPath)) {
    return resolvedPath;
  }

  const relativePath = relative(process.cwd(), resolvedPath);
  if (
    relativePath &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  return resolvedPath;
}

export function latestScreenshotPathForAiAct(
  value: unknown,
  options: CliVerboseScreenshotCollectOptions = {},
): string {
  const screenshot = collectScreenshotRefs(value, {
    ...options,
    exportMode: options.exportMode ?? 'report',
  })
    .slice()
    .reverse()
    .find((item) => typeof item.path === 'string' && item.path.length > 0);
  const path = typeof screenshot?.path === 'string' ? screenshot.path : '';
  return path ? pathForReportScreenshot(path, options.reportFile) : '';
}

export function renderScreenshotList(screenshots: unknown): string {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    return '';
  }

  return screenshots
    .map((item) => {
      if (!isRecord(item)) {
        return '';
      }
      const path =
        typeof item.path === 'string'
          ? item.path
          : typeof item.file === 'string'
            ? item.file
            : typeof item.id === 'string'
              ? item.id
              : '';
      const timing = typeof item.timing === 'string' ? item.timing : '';
      return [timing, path].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
}
