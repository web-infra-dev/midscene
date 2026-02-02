import { antiEscapeScriptTag, escapeScriptTag } from '@midscene/shared/utils';

export const escapeContent = escapeScriptTag;
export const unescapeContent = antiEscapeScriptTag;

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
  // Use global flag to find ALL matches, then return the LAST one
  // (the report template may contain similar regex patterns in bundled JS)
  const regex = /<script type="midscene_web_dump"[^>]*>([\s\S]*?)<\/script>/g;
  const matches = [...html.matchAll(regex)];
  const lastMatch = matches.length > 0 ? matches[matches.length - 1] : null;

  if (!lastMatch) {
    throw new Error('No dump script found in HTML');
  }

  return unescapeContent(lastMatch[1]);
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
