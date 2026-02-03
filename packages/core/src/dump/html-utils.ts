import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { antiEscapeScriptTag, escapeScriptTag } from '@midscene/shared/utils';

export const escapeContent = escapeScriptTag;
export const unescapeContent = antiEscapeScriptTag;

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
  const closeTag = '</script>';

  let result: string | null = null;

  streamScanTags(htmlPath, targetTag, closeTag, (content) => {
    result = unescapeContent(content);
    return true; // Stop after first match
  });

  return result;
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
  const scriptCloseTag = '</script>';

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
  const closeIndex = html.indexOf(scriptCloseTag, tagEndIndex);
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
  return (
    // biome-ignore lint/style/useTemplate: <explanation>
    '<script type="midscene-image" data-id="' +
    id +
    '">' +
    escapeContent(data) +
    '</script>'
  );
}

export function generateDumpScriptTag(
  json: string,
  attributes?: Record<string, string>,
): string {
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
    '</script>'
  );
}
