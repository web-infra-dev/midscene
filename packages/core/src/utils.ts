import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  defaultRunDirName,
  getMidsceneRunSubDir,
} from '@midscene/shared/common';
import {
  MIDSCENE_CACHE,
  MIDSCENE_DEBUG_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import { getRunningPkgInfo } from '@midscene/shared/node';
import { assert, logMsg } from '@midscene/shared/utils';
import {
  escapeScriptTag,
  ifInBrowser,
  ifInWorker,
  uuid,
} from '@midscene/shared/utils';
import { IMAGE_REF_PREFIX } from './screenshot-registry';
import type { ScreenshotRegistry } from './screenshot-registry';
import type {
  Cache,
  GroupedActionDump,
  Rect,
  ReportDumpWithAttributes,
} from './types';

let logEnvReady = false;

export { appendFileSync } from 'node:fs';

export const groupedActionDumpFileExt = 'web-dump.json';

/**
 * Process cache configuration with environment variable support and backward compatibility.
 *
 * @param cache - The original cache configuration
 * @param cacheId - The cache ID to use as:
 *   1. Fallback ID when cache is true or cache object has no ID
 *   2. Legacy cacheId when cache is undefined (requires MIDSCENE_CACHE env var)
 * @returns Processed cache configuration
 */
export function processCacheConfig(
  cache: Cache | undefined,
  cacheId: string,
): Cache | undefined {
  // 1. New cache object configuration (highest priority)
  if (cache !== undefined) {
    if (cache === false) {
      return undefined; // Completely disable cache
    }

    if (cache === true) {
      // Auto-generate ID using cacheId for CLI/YAML scenarios
      // Agent will validate and reject this later if needed
      return { id: cacheId };
    }

    // cache is object configuration
    if (typeof cache === 'object' && cache !== null) {
      // Auto-generate ID using cacheId when missing (for CLI/YAML scenarios)
      if (!cache.id) {
        return { ...cache, id: cacheId };
      }
      return cache;
    }
  }

  // 2. Backward compatibility: support old cacheId (requires environment variable)
  // When cache is undefined, check if legacy cacheId mode is enabled via env var
  const envEnabled = globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE);

  if (envEnabled && cacheId) {
    return { id: cacheId };
  }

  // 3. No cache configuration
  return undefined;
}

const reportInitializedMap = new Map<string, boolean>();

declare const __DEV_REPORT_PATH__: string;

export function getReportTpl() {
  if (typeof __DEV_REPORT_PATH__ === 'string' && __DEV_REPORT_PATH__) {
    return fs.readFileSync(__DEV_REPORT_PATH__, 'utf-8');
  }
  const reportTpl = 'REPLACE_ME_WITH_REPORT_HTML';

  return reportTpl;
}

/**
 * high performance, insert script before </html> in HTML file
 * only truncate and append, no temporary file
 */
export function insertScriptBeforeClosingHtml(
  filePath: string,
  scriptContent: string,
): void {
  const htmlEndTag = '</html>';
  const stat = fs.statSync(filePath);

  const readSize = Math.min(stat.size, 4096);
  const start = Math.max(0, stat.size - readSize);
  const buffer = Buffer.alloc(stat.size - start);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, buffer.length, start);
  fs.closeSync(fd);

  const tailStr = buffer.toString('utf8');
  const htmlEndIdx = tailStr.lastIndexOf(htmlEndTag);
  if (htmlEndIdx === -1) {
    throw new Error(`No </html> found in file：${filePath}`);
  }

  // calculate the correct byte position: char position to byte position
  const beforeHtmlInTail = tailStr.slice(0, htmlEndIdx);
  const htmlEndPos = start + Buffer.byteLength(beforeHtmlInTail, 'utf8');

  // truncate to </html> before
  fs.truncateSync(filePath, htmlEndPos);
  // append script and </html>
  fs.appendFileSync(filePath, `${scriptContent}\n${htmlEndTag}\n`);
}

export function reportHTMLContent(
  dumpData: string | ReportDumpWithAttributes,
  reportPath?: string,
  appendReport?: boolean,
  withTpl = true, // whether return with report template, default = true
  screenshotRegistry?: ScreenshotRegistry, // registry for generating image script tags
): string {
  let tpl = '';
  if (withTpl) {
    tpl = getReportTpl();

    if (!tpl) {
      console.warn('reportTpl is not set, will not write report');
      return '';
    }
  }
  // if reportPath is set, it means we are in write to file mode
  const writeToFile = reportPath && !ifInBrowser;

  let processedDumpString: string;
  let attributes: Record<string, string> | undefined;

  if (typeof dumpData === 'string') {
    processedDumpString = dumpData;
  } else {
    processedDumpString = dumpData.dumpString;
    attributes = dumpData.attributes;
  }

  // Generate image script tags from registry (if available)
  const imageScriptTags = screenshotRegistry?.generateScriptTags() ?? '';

  let dumpContent = '';

  if (!attributes) {
    // do not use template string here, will cause bundle error
    dumpContent =
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json">\n' +
      escapeScriptTag(processedDumpString) +
      '\n</script>';
  } else {
    const attributesArr = Object.keys(attributes).map((key) => {
      return `${key}="${encodeURIComponent(attributes![key])}"`;
    });

    dumpContent =
      // do not use template string here, will cause bundle error
      // biome-ignore lint/style/useTemplate: <explanation>
      '<script type="midscene_web_dump" type="application/json" ' +
      attributesArr.join(' ') +
      '>\n' +
      escapeScriptTag(processedDumpString) +
      '\n</script>';
  }

  // Combine image script tags and dump content
  let allScriptContent: string;
  if (imageScriptTags) {
    // biome-ignore lint/style/useTemplate: avoid bundle error
    allScriptContent = imageScriptTags + '\n' + dumpContent;
  } else {
    allScriptContent = dumpContent;
  }

  if (writeToFile) {
    if (!appendReport) {
      writeFileSync(reportPath!, `${tpl}\n${allScriptContent}`, { flag: 'w' });
      return reportPath!;
    }

    // Check if template is valid (contains </html>) for append mode
    const isValidTemplate = tpl.includes('</html>');
    if (!reportInitializedMap.get(reportPath!)) {
      if (isValidTemplate) {
        writeFileSync(reportPath!, tpl, { flag: 'w' });
      } else {
        // Use minimal HTML wrapper if template is invalid (e.g., placeholder in test env)
        writeFileSync(
          reportPath!,
          `<!DOCTYPE html><html><head></head><body>\n${allScriptContent}\n</body></html>`,
          { flag: 'w' },
        );
        reportInitializedMap.set(reportPath!, true);
        return reportPath!;
      }
      reportInitializedMap.set(reportPath!, true);
    }

    insertScriptBeforeClosingHtml(reportPath!, allScriptContent);
    return reportPath!;
  }

  return tpl + allScriptContent;
}

// Persistent screenshot counter map to prevent file overwriting during append operations
const screenshotCounterMap = new Map<string, number>();

/**
 * Check if a value is a base64 image data URI
 */
function isBase64ImageData(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/**
 * Check if a value is a screenshot registry reference
 */
function isImageReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Check if a key-value pair is an image field (either base64 or reference)
 */
function isImageField(key: string, value: unknown): boolean {
  return (
    (key === 'screenshot' || key === 'screenshotBase64') &&
    (isBase64ImageData(value) || isImageReference(value))
  );
}

/**
 * Recursively traverse object and process image fields
 */
function traverseImageFields(
  obj: unknown,
  onImage: (obj: Record<string, unknown>, key: string, value: string) => void,
): void {
  if (typeof obj !== 'object' || obj === null) return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => traverseImageFields(item, onImage));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (isImageField(key, value)) {
      onImage(obj as Record<string, unknown>, key, value as string);
    } else {
      traverseImageFields(value, onImage);
    }
  }
}

/**
 * Sanitize fileName to prevent path traversal attacks.
 * Removes path separators and special characters.
 */
function sanitizeFileName(fileName: string): string {
  // Remove path separators and parent directory references
  return fileName
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[/\\]/g, '_') // Replace path separators with underscores
    .replace(/^[._]+/, ''); // Remove leading dots and underscores
}

export function writeDirectoryReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes,
  appendReport?: boolean,
  screenshotRegistry?: ScreenshotRegistry,
): string | null {
  if (ifInBrowser || ifInWorker) {
    console.log('will not write directory report in browser');
    return null;
  }

  // Sanitize fileName to prevent path traversal
  const safeFileName = sanitizeFileName(fileName);
  const reportDir = path.join(getMidsceneRunSubDir('report'), safeFileName);
  const screenshotsDir = path.join(reportDir, 'screenshots');
  const indexPath = path.join(reportDir, 'index.html');

  try {
    // Create directories if they don't exist
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // Process data and extract screenshots (handles both base64 and references)
    const processedData = extractAndSaveScreenshots(
      dumpData,
      screenshotsDir,
      screenshotRegistry,
    );

    // Generate HTML report (images are already saved as separate files)
    reportHTMLContent(processedData, indexPath, appendReport, true);

    return indexPath;
  } catch (error) {
    // Provide more specific error messages based on error type
    if (error instanceof SyntaxError) {
      console.error(
        'Failed to write directory report due to JSON parsing error:',
        error,
      );
    } else if (error && typeof error === 'object' && 'code' in error) {
      const fsError = error as NodeJS.ErrnoException;
      const errorCode = fsError.code || 'UNKNOWN';
      console.error(
        'Failed to write directory report due to file system error (%s):',
        errorCode,
        fsError,
      );
    } else {
      console.error('Failed to write directory report:', error);
    }
    return null;
  }
}

function extractAndSaveScreenshots(
  dumpData: string | ReportDumpWithAttributes,
  screenshotsDir: string,
  screenshotRegistry?: ScreenshotRegistry,
): string {
  let data: Record<string, unknown>;

  if (typeof dumpData === 'string') {
    data = JSON.parse(dumpData);
  } else {
    data = JSON.parse(dumpData.dumpString);
  }

  let screenshotCounter = screenshotCounterMap.get(screenshotsDir) || 0;

  traverseImageFields(data, (parent, key, value) => {
    const screenshotFileName = `screenshot_${++screenshotCounter}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);

    let base64Data: string | undefined;

    if (isImageReference(value)) {
      // Value is a reference like "#midscene-img:groupName-img-0"
      // Get base64 data from registry
      if (screenshotRegistry) {
        const imageId = value.slice(IMAGE_REF_PREFIX.length);
        base64Data = screenshotRegistry.get(imageId);
      }
      if (!base64Data) {
        console.warn(
          'extractAndSaveScreenshots: could not resolve image reference:',
          value,
        );
        parent[key] = null;
        return;
      }
    } else if (isBase64ImageData(value)) {
      // Value is direct base64 data
      base64Data = value;
    } else {
      parent[key] = null;
      return;
    }

    // Extract base64 content and save to file
    const parts = base64Data.split(',');
    const isValidBase64DataUri =
      parts.length === 2 &&
      !!parts[1] &&
      typeof parts[0] === 'string' &&
      /^data:image\/[a-zA-Z0-9.+-]+;base64$/.test(parts[0]);

    if (isValidBase64DataUri) {
      writeFileSync(screenshotPath, Buffer.from(parts[1], 'base64'));
      parent[key] = `./screenshots/${screenshotFileName}`;
    } else {
      console.warn(
        'extractAndSaveScreenshots: encountered invalid image data, skipping screenshot for key:',
        key,
      );
      parent[key] = null;
    }
  });

  screenshotCounterMap.set(screenshotsDir, screenshotCounter);
  return JSON.stringify(data);
}

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes,
  appendReport?: boolean,
  screenshotRegistry?: ScreenshotRegistry,
): string | null {
  if (ifInBrowser || ifInWorker) {
    console.log('will not write report in browser');
    return null;
  }

  const reportPath = path.join(
    getMidsceneRunSubDir('report'),
    `${fileName}.html`,
  );

  reportHTMLContent(
    dumpData,
    reportPath,
    appendReport,
    true,
    screenshotRegistry,
  );

  if (process.env.MIDSCENE_DEBUG_LOG_JSON) {
    const jsonPath = `${reportPath}.json`;
    let data;

    if (typeof dumpData === 'string') {
      data = JSON.parse(dumpData) as ReportDumpWithAttributes;
    } else {
      data = dumpData;
    }

    writeFileSync(jsonPath, JSON.stringify(data, null, 2), {
      flag: appendReport ? 'a' : 'w',
    });

    logMsg(`Midscene - dump file written: ${jsonPath}`);
  }

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string | ReportDumpWithAttributes;
  type: 'dump' | 'cache' | 'report' | 'tmp';
  generateReport?: boolean;
  appendReport?: boolean;
  useDirectoryReport?: boolean;
  screenshotRegistry?: ScreenshotRegistry;
}) {
  if (ifInBrowser || ifInWorker) {
    return '/mock/report.html';
  }
  const { fileName, fileExt, fileContent, type = 'dump' } = opts;
  const targetDir = getMidsceneRunSubDir(type);
  // Ensure directory exists
  if (!logEnvReady) {
    assert(targetDir, 'logDir should be set before writing dump file');

    // gitIgnore in the parent directory
    const gitIgnorePath = path.join(targetDir, '../../.gitignore');
    const gitPath = path.join(targetDir, '../../.git');
    let gitIgnoreContent = '';

    if (existsSync(gitPath)) {
      // if the git path exists, we need to add the log folder to the git ignore file
      if (existsSync(gitIgnorePath)) {
        gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
      }

      // ignore the log folder
      if (!gitIgnoreContent.includes(`${defaultRunDirName}/`)) {
        writeFileSync(
          gitIgnorePath,
          `${gitIgnoreContent}\n# Midscene.js dump files\n${defaultRunDirName}/dump\n${defaultRunDirName}/report\n${defaultRunDirName}/tmp\n${defaultRunDirName}/log\n`,
          'utf-8',
        );
      }
    }

    logEnvReady = true;
  }

  const filePath = path.join(targetDir, `${fileName}.${fileExt}`);

  if (type !== 'dump') {
    // do not write dump file any more
    writeFileSync(filePath, JSON.stringify(fileContent));
  }

  if (opts?.generateReport) {
    if (opts.useDirectoryReport) {
      return writeDirectoryReport(
        fileName,
        fileContent,
        opts.appendReport,
        opts.screenshotRegistry,
      );
    }
    return writeDumpReport(
      fileName,
      fileContent,
      opts.appendReport,
      opts.screenshotRegistry,
    );
  }

  return filePath;
}

export function getTmpDir(): string | null {
  try {
    const runningPkgInfo = getRunningPkgInfo();
    if (!runningPkgInfo) {
      return null;
    }
    const { name } = runningPkgInfo;
    const tmpPath = path.join(tmpdir(), name);
    mkdirSync(tmpPath, { recursive: true });
    return tmpPath;
  } catch (e) {
    return null;
  }
}

export function getTmpFile(fileExtWithoutDot: string): string | null {
  if (ifInBrowser || ifInWorker) {
    return null;
  }
  const tmpDir = getTmpDir();
  const filename = `${uuid()}.${fileExtWithoutDot}`;
  return path.join(tmpDir!, filename);
}

export function overlapped(container: Rect, target: Rect) {
  // container and the target have some part overlapped
  return (
    container.left < target.left + target.width &&
    container.left + container.width > target.left &&
    container.top < target.top + target.height &&
    container.top + container.height > target.top
  );
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function replacerForPageObject(_key: string, value: any) {
  if (value && value.constructor?.name === 'Page') {
    return '[Page object]';
  }
  if (value && value.constructor?.name === 'Browser') {
    return '[Browser object]';
  }
  return value;
}

export function stringifyDumpData(data: any, indents?: number) {
  return JSON.stringify(data, replacerForPageObject, indents);
}

declare const __VERSION__: string;

export function getVersion() {
  return __VERSION__;
}

function debugLog(...message: any[]) {
  // always read from process.env, and cannot be override by modelConfig, overrideAIConfig, etc.
  // also avoid circular dependency
  const debugMode = process.env[MIDSCENE_DEBUG_MODE];
  if (debugMode) {
    console.log('[Midscene]', ...message);
  }
}

let lastReportedRepoUrl = '';
export function uploadTestInfoToServer({
  testUrl,
  serverUrl,
}: { testUrl: string; serverUrl?: string }) {
  if (!serverUrl) return;

  let repoUrl = '';
  let userEmail = '';

  try {
    repoUrl = execSync('git config --get remote.origin.url').toString().trim();
    userEmail = execSync('git config --get user.email').toString().trim();
  } catch (error) {
    debugLog('Failed to get git info:', error);
  }

  // Only upload test info if:
  // 1. Server URL is configured AND
  // 2. Either:
  //    - We have a repo URL that's different from last reported one (to avoid duplicate reports)
  //    - OR we don't have a repo URL but have a test URL (for non-git environments)
  if (repoUrl ? repoUrl !== lastReportedRepoUrl : !!testUrl) {
    debugLog('Uploading test info to server', {
      serverUrl,
      repoUrl,
      testUrl,
      userEmail,
    });

    fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo_url: repoUrl,
        test_url: testUrl,
        user_email: userEmail,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        debugLog('Successfully uploaded test info to server:', data);
      })
      .catch((error) =>
        debugLog('Failed to upload test info to server:', error),
      );
    lastReportedRepoUrl = repoUrl;
  }
}
