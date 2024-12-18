import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getRunningPkgInfo } from '@midscene/shared/fs';
import { ifInBrowser, uuid } from '@midscene/shared/utils';
import { extractJSONFromCodeBlock } from './ai-model/openai';
import {
  MIDSCENE_DEBUG_MODE,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  getAIConfig,
  getAIConfigInJson,
} from './env';
import type { Rect, ReportDumpWithAttributes } from './types';

let logDir = join(process.cwd(), './midscene_run/');
let logEnvReady = false;
export const insightDumpFileExt = 'insight-dump.json';
export const groupedActionDumpFileExt = 'web-dump.json';

export function getLogDir() {
  return logDir;
}

export function setLogDir(dir: string) {
  logDir = dir;
}

export function getLogDirByType(type: 'dump' | 'cache' | 'report' | 'tmp') {
  const dir = join(getLogDir(), type);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

let reportTpl: string | null = null;
function getReportTpl() {
  if (ifInBrowser) {
    if (!reportTpl && (window as any).midscene_report_tpl) {
      reportTpl = (window as any).midscene_report_tpl;
    }
    assert(
      reportTpl,
      'reportTpl should be set before writing report in browser',
    );
    return reportTpl;
  }

  if (!reportTpl) {
    let reportPath = join(__dirname, '../../report/index.html');
    if (!existsSync(reportPath)) {
      reportPath = join(__dirname, '../report/index.html');
    }
    reportTpl = readFileSync(reportPath, 'utf-8');
  }
  return reportTpl;
}

export function reportHTMLContent(
  dumpData: string | ReportDumpWithAttributes[],
): string {
  const tpl = getReportTpl();
  let reportContent: string;
  if (
    (Array.isArray(dumpData) && dumpData.length === 0) ||
    typeof dumpData === 'undefined'
  ) {
    reportContent = tpl.replace(
      /\s+{{dump}}\s+/,
      `<script type="midscene_web_dump" type="application/json"></script>`,
    );
  } else if (typeof dumpData === 'string') {
    reportContent = tpl.replace(
      /\s+{{dump}}\s+/,
      `<script type="midscene_web_dump" type="application/json">${dumpData}</script>`,
    );
  } else {
    const dumps = dumpData.map(({ dumpString, attributes }) => {
      const attributesArr = Object.keys(attributes || {}).map((key) => {
        return `${key}="${encodeURIComponent(attributes![key])}"`;
      });
      return `<script type="midscene_web_dump" type="application/json" ${attributesArr.join(
        ' ',
      )}\n>${dumpString}\n</script>`;
    });
    reportContent = tpl.replace(/\s+{{dump}}\s+/, dumps.join('\n'));
  }
  return reportContent;
}

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes[],
): string | null {
  if (ifInBrowser) {
    console.log('will not write report in browser');
    return null;
  }

  const midscenePkgInfo = getRunningPkgInfo(__dirname);
  if (!midscenePkgInfo) {
    console.warn('midscenePkgInfo not found, will not write report');
    return null;
  }

  const reportPath = join(getLogDirByType('report'), `${fileName}.html`);
  const reportContent = reportHTMLContent(dumpData);
  writeFileSync(reportPath, reportContent);

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string;
  type: 'dump' | 'cache' | 'report' | 'tmp';
  generateReport?: boolean;
}) {
  if (ifInBrowser) {
    return '/mock/report.html';
  }
  const { fileName, fileExt, fileContent, type = 'dump' } = opts;
  const targetDir = getLogDirByType(type);
  // Ensure directory exists
  if (!logEnvReady) {
    assert(targetDir, 'logDir should be set before writing dump file');

    // gitIgnore in the parent directory
    const gitIgnorePath = join(targetDir, '../../.gitignore');
    let gitIgnoreContent = '';
    if (existsSync(gitIgnorePath)) {
      gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
    }

    // ignore the log folder
    const logDirName = basename(logDir);
    if (!gitIgnoreContent.includes(`${logDirName}/`)) {
      writeFileSync(
        gitIgnorePath,
        `${gitIgnoreContent}\n# Midscene.js dump files\n${logDirName}/report\n${logDirName}/dump\n${logDirName}/tmp\n`,
        'utf-8',
      );
    }
    logEnvReady = true;
  }

  const filePath = join(targetDir, `${fileName}.${fileExt}`);

  const outputResourceDir = dirname(filePath);
  if (!existsSync(outputResourceDir)) {
    mkdirSync(outputResourceDir, { recursive: true });
  }

  writeFileSync(filePath, fileContent);

  if (opts?.generateReport) {
    return writeDumpReport(fileName, fileContent);
  }

  return filePath;
}

export function getTmpDir(): string | null {
  if (ifInBrowser) {
    return null;
  }
  const runningPkgInfo = getRunningPkgInfo();
  if (!runningPkgInfo) {
    return null;
  }
  const { name } = runningPkgInfo;
  const path = join(tmpdir(), name);
  mkdirSync(path, { recursive: true });
  return path;
}

export function getTmpFile(fileExtWithoutDot: string): string | null {
  if (ifInBrowser) {
    return null;
  }
  const tmpDir = getTmpDir();
  const filename = `${uuid()}.${fileExtWithoutDot}`;
  return join(tmpDir!, filename);
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

export function replacerForPageObject(key: string, value: any) {
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
  const debugMode = getAIConfig(MIDSCENE_DEBUG_MODE);
  if (debugMode) {
    console.log('[Midscene]', ...message);
  }
}

let lastReportedRepoUrl = '';
export function uploadTestInfoToServer({ testUrl }: { testUrl: string }) {
  let repoUrl = '';
  let userEmail = '';

  const extraConfig = getAIConfigInJson(MIDSCENE_OPENAI_INIT_CONFIG_JSON);
  const serverUrl = extraConfig?.REPORT_SERVER_URL;

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
  if (
    serverUrl &&
    ((repoUrl && repoUrl !== lastReportedRepoUrl) || (!repoUrl && testUrl))
  ) {
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

export function parseNonStrictJSON(source: string) {
  let jsonObj = null;
  source = extractJSONFromCodeBlock(source);
  source = fixNestedDoubleQuotes(source);
  try {
    jsonObj = JSON.parse(source);
  } catch (e) {
    try {
      jsonObj = new Function(`return ${source}`)();
    } catch (e) {
      console.error('无法 parse 的 source:', source);
    }
  }
  return jsonObj;
}

function fixNestedDoubleQuotes(jsonStr: string): string {
  let result = '';
  let inString = false; // 当前是否在字符串中
  let escapeNext = false; // 下一个字符是否需要被转义处理
  let i = 0;

  while (i < jsonStr.length) {
    const char = jsonStr[i];

    if (inString) {
      if (escapeNext) {
        // 上一个字符是 \ ，本字符按字面加入
        escapeNext = false;
        result += char;
      } else {
        if (char === '\\') {
          // 转义下一个字符
          escapeNext = true;
          result += char;
        } else if (char === '"') {
          // 可能是字符串结束或内部引号
          // 查看后续非空白字符决定它是结束还是内部引号
          let lookAhead = i + 1;
          // 跳过后续空白
          while (lookAhead < jsonStr.length && /\s/.test(jsonStr[lookAhead])) {
            lookAhead++;
          }
          const nextChar = jsonStr[lookAhead];

          // 如果后续字符是 , : } ] 或不存在(结尾)，则此引号为结束引号
          if (
            nextChar === ',' ||
            nextChar === ':' ||
            nextChar === '}' ||
            nextChar === ']' ||
            nextChar === undefined
          ) {
            // 结束引号
            inString = false;
            result += char;
          } else {
            // 内部引号，需转义
            result += '\\"';
          }
        } else {
          // 字符串内部正常字符
          result += char;
        }
      }
    } else {
      // 不在字符串中
      if (char === '"') {
        // 进入字符串状态
        inString = true;
        result += char;
      } else {
        result += char;
      }
    }
    i++;
  }

  return result;
}
