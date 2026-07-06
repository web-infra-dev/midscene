import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { antiEscapeScriptTag, escapeScriptTag } from '@midscene/shared/utils';
import type { AIUsageInfo, IReportActionDump, ModelBrief } from '../types';

export const escapeContent = escapeScriptTag;
export const unescapeContent = antiEscapeScriptTag;

function cleanHtmlCommentValue(value: unknown): string {
  return String(value ?? 'N/A')
    .replace(/\0/g, '')
    .replace(/--/g, '- -');
}

function formatModelBriefForAgent(brief: ModelBrief): string {
  const intent = brief.intent || 'default';
  const model = brief.name || 'unknown';
  const description = brief.modelDescription
    ? ` (${brief.modelDescription})`
    : '';
  return `${intent}: ${model}${description}`;
}

function hasUsageModelInfo(usage?: AIUsageInfo): usage is AIUsageInfo {
  return Boolean(
    usage &&
      (usage.model_name ||
        usage.response_model_name ||
        usage.model_description ||
        usage.intent),
  );
}

function formatUsageModelForAgent(source: string, usage: AIUsageInfo): string {
  const intent = usage.intent || source;
  const model = usage.model_name || usage.response_model_name || 'unknown';
  const description = usage.model_description
    ? ` (${usage.model_description})`
    : '';
  return `${intent}: ${model}${description}`;
}

function collectUsageModelsForAgent(report: IReportActionDump): string {
  const models = new Map<string, string>();
  const executions = Array.isArray(report.executions) ? report.executions : [];
  for (const execution of executions) {
    const tasks = Array.isArray(execution.tasks) ? execution.tasks : [];
    for (const task of tasks) {
      const taskWithUsage = task as {
        usage?: AIUsageInfo;
        searchAreaUsage?: AIUsageInfo;
      };
      const usages: Array<[string, AIUsageInfo | undefined]> = [
        ['main', taskWithUsage.usage],
        ['searchArea', taskWithUsage.searchAreaUsage],
      ];

      for (const [source, usage] of usages) {
        if (!hasUsageModelInfo(usage)) {
          continue;
        }
        const formatted = formatUsageModelForAgent(source, usage);
        models.set(formatted, formatted);
      }
    }
  }

  return Array.from(models.values()).join('; ');
}

export function generateAgentReportComment(report: IReportActionDump): string {
  const executions = Array.isArray(report.executions) ? report.executions : [];
  const taskCount = executions.reduce(
    (sum, execution) =>
      sum + (Array.isArray(execution.tasks) ? execution.tasks.length : 0),
    0,
  );
  const modelBriefs = report.modelBriefs?.length
    ? report.modelBriefs.map(formatModelBriefForAgent).join('; ')
    : collectUsageModelsForAgent(report) || 'No model metadata recorded';

  const lines = [
    'For Agent Analysis:',
    `Report: ${cleanHtmlCommentValue(report.groupName)}`,
    `SDK: ${cleanHtmlCommentValue(report.sdkVersion)}`,
    `Device: ${cleanHtmlCommentValue(report.deviceType)}`,
    `Executions: ${executions.length}; Tasks: ${taskCount}`,
    `Models: ${cleanHtmlCommentValue(modelBriefs)}`,
    'Structured report JSON is stored in script[type="midscene_web_dump"] tags near this comment.',
    'Screenshots are stored as script[type="midscene-image"] tags or files referenced by screenshot refs.',
    'For AI analysis, inspect each execution task for type, status, timing, param, output, usage, searchAreaUsage, recorder, and screenshot refs.',
    'Use the Markdown export when available; it contains the same report context plus image links for agent review.',
  ];

  return `\n<!--\n${lines.join('\n')}\n-->\n`;
}

function htmlScriptCloseTag(): string {
  // biome-ignore lint/style/useTemplate: keep this token runtime-built for inline report bundles
  return String.fromCharCode(60) + '/script>';
}

/** Chunk size for streaming file operations (64KB) */
export const STREAMING_CHUNK_SIZE = 64 * 1024;

/**
 * Callback for processing matched tags during streaming.
 * @param content - The content between open and close tags
 * @returns true to stop scanning, false to continue
 */
type TagMatchCallback = (content: string) => boolean;

/**
 * Stream through a file and find tags matching the pattern.
 * Memory usage: O(chunk_size + tag_size), not O(file_size).
 *
 * @param filePath - Absolute path to the file
 * @param openTag - Opening tag to search for
 * @param closeTag - Closing tag
 * @param onMatch - Callback for each matched tag content
 */
export function streamScanTags(
  filePath: string,
  openTag: string,
  closeTag: string,
  onMatch: TagMatchCallback,
): void {
  const fd = openSync(filePath, 'r');
  const fileSize = statSync(filePath).size;
  const buffer = Buffer.alloc(STREAMING_CHUNK_SIZE);

  let position = 0;
  let leftover = '';
  let capturing = false;
  let currentContent = '';

  try {
    while (position < fileSize) {
      const bytesRead = readSync(fd, buffer, 0, STREAMING_CHUNK_SIZE, position);
      const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
      position += bytesRead;

      let searchStart = 0;

      while (searchStart < chunk.length) {
        if (!capturing) {
          const startIdx = chunk.indexOf(openTag, searchStart);
          if (startIdx !== -1) {
            capturing = true;
            currentContent = chunk.slice(startIdx + openTag.length);
            const endIdx = currentContent.indexOf(closeTag);
            if (endIdx !== -1) {
              const shouldStop = onMatch(currentContent.slice(0, endIdx));
              if (shouldStop) return;
              capturing = false;
              currentContent = '';
              searchStart =
                startIdx + openTag.length + endIdx + closeTag.length;
            } else {
              leftover = currentContent.slice(-closeTag.length);
              currentContent = currentContent.slice(0, -closeTag.length);
              break;
            }
          } else {
            leftover = chunk.slice(-openTag.length);
            break;
          }
        } else {
          const endIdx = chunk.indexOf(closeTag, searchStart);
          if (endIdx !== -1) {
            currentContent += chunk.slice(searchStart, endIdx);
            const shouldStop = onMatch(currentContent);
            if (shouldStop) return;
            capturing = false;
            currentContent = '';
            searchStart = endIdx + closeTag.length;
          } else {
            currentContent += chunk.slice(searchStart, -closeTag.length);
            leftover = chunk.slice(-closeTag.length);
            break;
          }
        }
      }
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Synchronously extract a specific image's base64 data from an HTML file by its id.
 * Uses streaming to avoid loading the entire file into memory.
 *
 * @param htmlPath - Absolute path to the HTML file
 * @param imageId - The id of the image to extract
 * @returns The base64 data string, or null if not found
 */
export function extractImageByIdSync(
  htmlPath: string,
  imageId: string,
): string | null {
  const targetTag = `<script type="midscene-image" data-id="${imageId}">`;
  const closeTag = htmlScriptCloseTag();

  let result: string | null = null;

  streamScanTags(htmlPath, targetTag, closeTag, (content) => {
    result = unescapeContent(content);
    return true; // Stop after first match
  });

  return result;
}

/**
 * Stream image script tags from source file directly to output file.
 * Memory usage: O(single_image_size), not O(all_images_size).
 *
 * @param srcFilePath - Source HTML file path
 * @param destFilePath - Destination file path to append to
 */
export function streamImageScriptsToFile(
  srcFilePath: string,
  destFilePath: string,
): void {
  const { appendFileSync } = require('node:fs');
  const openTag = '<script type="midscene-image"';
  const closeTag = htmlScriptCloseTag();

  streamScanTags(srcFilePath, openTag, closeTag, (content) => {
    // Write complete tag immediately to destination, don't accumulate
    appendFileSync(destFilePath, `${openTag}${content}${closeTag}\n`);
    return false; // Continue scanning for more tags
  });
}

/**
 * Extract the LAST dump script content from HTML file using streaming.
 * Memory usage: O(dump_size), not O(file_size).
 *
 * @param filePath - Absolute path to the HTML file
 * @returns The dump script content (trimmed), or empty string if not found
 */
export function extractLastDumpScriptSync(filePath: string): string {
  const openTagPrefix = '<script type="midscene_web_dump"';
  const closeTag = htmlScriptCloseTag();

  let lastContent = '';

  // Custom streaming to handle the special case where open tag has variable attributes
  const fd = openSync(filePath, 'r');
  const fileSize = statSync(filePath).size;
  const buffer = Buffer.alloc(STREAMING_CHUNK_SIZE);

  let position = 0;
  let leftover = '';
  let capturing = false;
  let currentContent = '';

  try {
    while (position < fileSize) {
      const bytesRead = readSync(fd, buffer, 0, STREAMING_CHUNK_SIZE, position);
      const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
      position += bytesRead;

      let searchStart = 0;

      while (searchStart < chunk.length) {
        if (!capturing) {
          const startIdx = chunk.indexOf(openTagPrefix, searchStart);
          if (startIdx !== -1) {
            // Find the end of the opening tag (the '>' character)
            const tagEndIdx = chunk.indexOf('>', startIdx);
            if (tagEndIdx !== -1) {
              capturing = true;
              currentContent = chunk.slice(tagEndIdx + 1);
              const endIdx = currentContent.indexOf(closeTag);
              if (endIdx !== -1) {
                lastContent = currentContent.slice(0, endIdx).trim();
                capturing = false;
                currentContent = '';
                searchStart = tagEndIdx + 1 + endIdx + closeTag.length;
              } else {
                leftover = currentContent.slice(-closeTag.length);
                currentContent = currentContent.slice(0, -closeTag.length);
                break;
              }
            } else {
              leftover = chunk.slice(startIdx);
              break;
            }
          } else {
            leftover = chunk.slice(-openTagPrefix.length);
            break;
          }
        } else {
          const endIdx = chunk.indexOf(closeTag, searchStart);
          if (endIdx !== -1) {
            currentContent += chunk.slice(searchStart, endIdx);
            lastContent = currentContent.trim();
            capturing = false;
            currentContent = '';
            searchStart = endIdx + closeTag.length;
          } else {
            currentContent += chunk.slice(searchStart, -closeTag.length);
            leftover = chunk.slice(-closeTag.length);
            break;
          }
        }
      }
    }
  } finally {
    closeSync(fd);
  }

  return lastContent;
}

/**
 * Extract ALL dump script contents from an HTML file using streaming.
 * Each entry includes the full opening tag (for attribute extraction) and the content.
 *
 * @param filePath - Absolute path to the HTML file
 * @returns Array of { openTag, content } for each dump script found
 */
export function extractAllDumpScriptsSync(
  filePath: string,
): { openTag: string; content: string }[] {
  const results: { openTag: string; content: string }[] = [];
  streamDumpScriptsSync(filePath, (dumpScript) => {
    results.push(dumpScript);
    return false;
  });
  return results;
}

/**
 * Stream ALL dump scripts from an HTML file.
 * Calls onMatch for each dump script and keeps memory bounded to a single
 * dump script payload instead of accumulating every dump in memory.
 *
 * @param filePath - Absolute path to the HTML file
 * @param onMatch - Callback for each dump script; return true to stop early
 */
export function streamDumpScriptsSync(
  filePath: string,
  onMatch: (dumpScript: { openTag: string; content: string }) => boolean,
): void {
  const openTagPrefix = '<script type="midscene_web_dump"';
  const closeTag = htmlScriptCloseTag();

  const fd = openSync(filePath, 'r');
  const fileSize = statSync(filePath).size;
  const buffer = Buffer.alloc(STREAMING_CHUNK_SIZE);

  let position = 0;
  let leftover = '';
  let capturing = false;
  let currentContent = '';
  let currentOpenTag = '';

  try {
    while (position < fileSize) {
      const bytesRead = readSync(fd, buffer, 0, STREAMING_CHUNK_SIZE, position);
      const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
      position += bytesRead;

      let searchStart = 0;

      while (searchStart < chunk.length) {
        if (!capturing) {
          const startIdx = chunk.indexOf(openTagPrefix, searchStart);
          if (startIdx !== -1) {
            const tagEndIdx = chunk.indexOf('>', startIdx);
            if (tagEndIdx !== -1) {
              capturing = true;
              currentOpenTag = chunk.slice(startIdx, tagEndIdx + 1);
              currentContent = chunk.slice(tagEndIdx + 1);
              const endIdx = currentContent.indexOf(closeTag);
              if (endIdx !== -1) {
                const shouldStop = onMatch({
                  openTag: currentOpenTag,
                  content: currentContent.slice(0, endIdx).trim(),
                });
                if (shouldStop) return;
                capturing = false;
                currentContent = '';
                currentOpenTag = '';
                searchStart = tagEndIdx + 1 + endIdx + closeTag.length;
              } else {
                leftover = currentContent.slice(-closeTag.length);
                currentContent = currentContent.slice(0, -closeTag.length);
                break;
              }
            } else {
              leftover = chunk.slice(startIdx);
              break;
            }
          } else {
            leftover = chunk.slice(-openTagPrefix.length);
            break;
          }
        } else {
          const endIdx = chunk.indexOf(closeTag, searchStart);
          if (endIdx !== -1) {
            currentContent += chunk.slice(searchStart, endIdx);
            const shouldStop = onMatch({
              openTag: currentOpenTag,
              content: currentContent.trim(),
            });
            if (shouldStop) return;
            capturing = false;
            currentContent = '';
            currentOpenTag = '';
            searchStart = endIdx + closeTag.length;
          } else {
            currentContent += chunk.slice(searchStart, -closeTag.length);
            leftover = chunk.slice(-closeTag.length);
            break;
          }
        }
      }
    }
  } finally {
    closeSync(fd);
  }
}

export function parseImageScripts(html: string): Record<string, string> {
  const imageMap: Record<string, string> = {};
  const regex =
    /<script type="midscene-image" data-id="([^"]+)">([\s\S]*?)<\/script>/g;

  for (const match of html.matchAll(regex)) {
    const [, id, content] = match;
    imageMap[id] = unescapeContent(content);
  }

  return imageMap;
}

export function parseDumpScript(html: string): string {
  // Use string search instead of regex to avoid ReDoS vulnerability
  // Find the LAST dump script tag (template may contain similar patterns in bundled JS)
  const scriptOpenTag = '<script type="midscene_web_dump"';
  const closeTag = htmlScriptCloseTag();

  // Find the last occurrence of the opening tag
  const lastOpenIndex = html.lastIndexOf(scriptOpenTag);
  if (lastOpenIndex === -1) {
    throw new Error('No dump script found in HTML');
  }

  // Find the end of the opening tag (the '>' character)
  const tagEndIndex = html.indexOf('>', lastOpenIndex);
  if (tagEndIndex === -1) {
    throw new Error('No dump script found in HTML');
  }

  // Find the closing tag after the opening tag
  const closeIndex = html.indexOf(closeTag, tagEndIndex);
  if (closeIndex === -1) {
    throw new Error('No dump script found in HTML');
  }

  // Extract content between opening and closing tags
  const content = html.substring(tagEndIndex + 1, closeIndex);
  return unescapeContent(content);
}

export function parseDumpScriptAttributes(
  html: string,
): Record<string, string> {
  const regex = /<script type="midscene_web_dump"([^>]*)>/;
  const match = regex.exec(html);

  if (!match) {
    return {};
  }

  const attrString = match[1];
  const attributes: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;

  for (const attrMatch of attrString.matchAll(attrRegex)) {
    const [, key, value] = attrMatch;
    if (key !== 'type') {
      attributes[key] = decodeURIComponent(value);
    }
  }

  return attributes;
}

export function generateImageScriptTag(id: string, data: string): string {
  // Do not use template string here, will cause bundle error with <script
  const closeTag = htmlScriptCloseTag();
  return (
    // biome-ignore lint/style/useTemplate: <explanation>
    '<script type="midscene-image" data-id="' +
    id +
    '">' +
    escapeContent(data) +
    closeTag
  );
}

/**
 * Inline script that fixes relative URL resolution for directory-mode reports.
 *
 * Problem: when a static server (e.g. `npx serve`) serves `name/index.html`
 * at URL `/name` (without trailing slash), relative paths like
 * `./screenshots/xxx.png` resolve to `/screenshots/xxx.png` instead of
 * `/name/screenshots/xxx.png`.
 *
 * Fix: dynamically insert a <base> tag so relative URLs resolve correctly.
 */
// Do not use template string here, will cause bundle error with <script
//
// The closing script tag is built at runtime so bundlers cannot inline the
// token that would prematurely close the report template's inline app bundle.
//
// Do NOT replace this with a string constant, hex escape (\x3c), or literal
// string concatenation. Bundlers may optimise those forms back to the unsafe
// token.
let _baseUrlFixScript: string;
export function getBaseUrlFixScript(): string {
  if (!_baseUrlFixScript) {
    const close = htmlScriptCloseTag();
    _baseUrlFixScript =
      // biome-ignore lint/style/useTemplate: see above
      '\n<script>(function(){' +
      'var p=window.location.pathname;' +
      'if(p.endsWith("/")||/\\.\\w+$/.test(p))return;' +
      'var b=document.createElement("base");' +
      'b.href=p+"/";' +
      'document.head.insertBefore(b,document.head.firstChild)' +
      '})()' +
      close +
      '\n';
  }
  return _baseUrlFixScript;
}

/**
 * Dump-script attribute that records how the report file stores screenshots.
 * Written by the report generator and the merger, read back when deciding
 * whether a report is in directory mode. Kept here, next to dump-tag
 * generation, so the writer and reader share one source of truth.
 */
export const DATA_SCREENSHOT_MODE_ATTR = 'data-screenshot-mode';

export function generateDumpScriptTag(
  json: string,
  attributes?: Record<string, string | number | boolean>,
): string {
  const closeTag = htmlScriptCloseTag();
  let attrString = '';
  if (attributes && Object.keys(attributes).length > 0) {
    // Do not use template string here, will cause bundle error with <script
    attrString =
      // biome-ignore lint/style/useTemplate: <explanation>
      ' ' +
      Object.entries(attributes)
        // biome-ignore lint/style/useTemplate: <explanation>
        .map(([k, v]) => k + '="' + encodeURIComponent(v) + '"')
        .join(' ');
  }

  // Do not use template string here, will cause bundle error with <script
  return (
    // biome-ignore lint/style/useTemplate: <explanation>
    '<script type="midscene_web_dump"' +
    attrString +
    '>' +
    escapeContent(json) +
    closeTag
  );
}
