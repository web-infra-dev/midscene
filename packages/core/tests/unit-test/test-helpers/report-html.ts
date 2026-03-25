type ScriptTag = {
  openTag: string;
  content: string;
};

/**
 * Parse real HTML <script> nodes while skipping any "<script ...>" strings
 * that appear inside an existing script body after the report app is built.
 */
export function extractActualScriptTags(html: string): ScriptTag[] {
  const scripts: ScriptTag[] = [];
  const closeTag = '</script>';
  let position = 0;

  while (position < html.length) {
    const scriptStart = html.indexOf('<script', position);
    if (scriptStart === -1) {
      break;
    }

    const openTagEnd = html.indexOf('>', scriptStart);
    if (openTagEnd === -1) {
      break;
    }

    const closeTagStart = html.indexOf(closeTag, openTagEnd + 1);
    if (closeTagStart === -1) {
      break;
    }

    scripts.push({
      openTag: html.slice(scriptStart, openTagEnd + 1),
      content: html.slice(openTagEnd + 1, closeTagStart),
    });

    position = closeTagStart + closeTag.length;
  }

  return scripts;
}

export function extractGroupedDumpScripts(html: string): ScriptTag[] {
  return extractActualScriptTags(html).filter(
    (script) =>
      script.openTag.includes('type="midscene_web_dump"') &&
      script.openTag.includes('data-group-id="'),
  );
}

export function countGroupedDumpScripts(html: string): number {
  return extractGroupedDumpScripts(html).length;
}

export function getGroupedDumpScriptIds(html: string): string[] {
  return extractGroupedDumpScripts(html)
    .map((script) => {
      const match = script.openTag.match(/data-group-id="([^"]+)"/);
      return match?.[1];
    })
    .filter((groupId): groupId is string => Boolean(groupId))
    .map((groupId) => decodeURIComponent(groupId));
}
