import { antiEscapeScriptTag, escapeScriptTag } from '@midscene/shared/utils';

export const escapeContent = escapeScriptTag;
export const unescapeContent = antiEscapeScriptTag;

export function parseImageScripts(html: string): Record<string, string> {
  const imageMap: Record<string, string> = {};
  const regex =
    /<script type="midscene-image" data-id="([^"]+)">([\s\S]*?)<\/script>/g;

  let match = regex.exec(html);
  while (match !== null) {
    const [, id, content] = match;
    imageMap[id] = unescapeContent(content);
    match = regex.exec(html);
  }

  return imageMap;
}

export function parseDumpScript(html: string): string {
  const regex = /<script type="midscene_web_dump"[^>]*>([\s\S]*?)<\/script>/;
  const match = regex.exec(html);

  if (!match) {
    throw new Error('No dump script found in HTML');
  }

  return unescapeContent(match[1]);
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

  let attrMatch = attrRegex.exec(attrString);
  while (attrMatch !== null) {
    const [, key, value] = attrMatch;
    if (key !== 'type') {
      attributes[key] = decodeURIComponent(value);
    }
    attrMatch = attrRegex.exec(attrString);
  }

  return attributes;
}

export function generateImageScriptTag(id: string, data: string): string {
  return `<script type="midscene-image" data-id="${id}">${escapeContent(data)}</script>`;
}

export function generateDumpScriptTag(
  json: string,
  attributes?: Record<string, string>,
): string {
  let attrString = '';
  if (attributes && Object.keys(attributes).length > 0) {
    attrString = ` ${Object.entries(attributes)
      .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`)
      .join(' ')}`;
  }

  return `<script type="midscene_web_dump"${attrString}>${escapeContent(json)}</script>`;
}
