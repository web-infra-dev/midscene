import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
export { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  MIDSCENE_CACHE,
  MIDSCENE_DEBUG_MODE,
  globalConfigManager,
} from '@midscene/shared/env';
import { logMsg } from '@midscene/shared/utils';
import {
  escapeScriptTag,
  ifInBrowser,
  ifInWorker,
  uuid,
} from '@midscene/shared/utils';
import { generateImageScriptTag } from './dump/html-utils';
import type { Cache, Rect, ReportDumpWithAttributes } from './types';

export const appendFileSync = fs.appendFileSync;

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

declare const __DEV_REPORT_TPL__: string;

export function getReportTpl() {
  // __DEV_REPORT_TPL__ is replaced with actual HTML during build
  // In development mode, rslib replaces this with the report template content
  // In production, 'REPLACE_ME_WITH_REPORT_HTML' is replaced with actual HTML
  if (typeof __DEV_REPORT_TPL__ === 'string' && __DEV_REPORT_TPL__) {
    return __DEV_REPORT_TPL__;
  }

  // Return embedded template (works in both browser and Node.js)
  // This placeholder is replaced with actual HTML during build
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
  if (ifInBrowser) {
    throw new Error(
      'insertScriptBeforeClosingHtml is not supported in browser',
    );
  }

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
  let imageMap: Record<string, string> | undefined;

  if (typeof dumpData === 'string') {
    processedDumpString = dumpData;
  } else {
    processedDumpString = dumpData.dumpString;
    attributes = dumpData.attributes;
    imageMap = dumpData.imageMap;
  }

  // Generate image script tags if imageMap is provided
  let imageContent = '';
  if (imageMap && Object.keys(imageMap).length > 0) {
    imageContent = Object.entries(imageMap)
      .map(([id, data]) => generateImageScriptTag(id, data))
      .join('\n');
  }

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

  // Combine image tags and dump content (images first, then dump)
  const allScriptContent = imageContent
    ? `${imageContent}\n${dumpContent}`
    : dumpContent;

  if (writeToFile) {
    if (!appendReport) {
      fs.writeFileSync(reportPath!, `${tpl}\n${allScriptContent}`, {
        flag: 'w',
      });
      return reportPath!;
    }

    // Check if template is valid (contains </html>) for append mode
    const isValidTemplate = tpl.includes('</html>');
    if (!reportInitializedMap.get(reportPath!)) {
      if (isValidTemplate) {
        fs.writeFileSync(reportPath!, tpl, { flag: 'w' });
      } else {
        // Use minimal HTML wrapper if template is invalid (e.g., placeholder in test env)
        fs.writeFileSync(
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

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes,
  appendReport?: boolean,
): string | null {
  if (ifInBrowser || ifInWorker) {
    console.log('will not write report in browser');
    return null;
  }

  const reportPath = path.join(
    getMidsceneRunSubDir('report'),
    `${fileName}.html`,
  );

  reportHTMLContent(dumpData, reportPath, appendReport, true);

  if (process.env.MIDSCENE_DEBUG_LOG_JSON) {
    const jsonPath = `${reportPath}.json`;
    let data;

    if (typeof dumpData === 'string') {
      data = JSON.parse(dumpData) as ReportDumpWithAttributes;
    } else {
      data = dumpData;
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), {
      flag: appendReport ? 'a' : 'w',
    });

    logMsg(`Midscene - dump file written: ${jsonPath}`);
  }

  return reportPath;
}

export function getTmpDir(): string | null {
  if (ifInBrowser || ifInWorker) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRunningPkgInfo } = require('@midscene/shared/node');

    const runningPkgInfo = getRunningPkgInfo();
    if (!runningPkgInfo) {
      return null;
    }
    const { name } = runningPkgInfo;
    const tmpPath = path.join(os.tmpdir(), name);
    fs.mkdirSync(tmpPath, { recursive: true });
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

  // Skip in browser environment
  if (ifInBrowser || ifInWorker) return;

  let repoUrl = '';
  let userEmail = '';

  try {
    const { execSync } = require('node:child_process');
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
