/**
 * Shared helpers for reading the dump data embedded in a report HTML.
 *
 * The report App renders these dumps lazily (with per-group attributes), while
 * the headless video exporter reads them eagerly. Both go through the same
 * grouping/parsing/dedupe logic here so the two paths cannot drift apart.
 */
import { GroupedActionDump, restoreImageReferences } from '@midscene/core/dump';
import { antiEscapeScriptTag } from '@midscene/shared/utils';

// Shared image cache across all callers — resolved images are cached by id.
const imageCache = new Map<string, string>();

function dedupeExecutionsKeepLatest<
  T extends GroupedActionDump['executions'][number],
>(executions: T[]): T[] {
  let noIdCounter = 0;
  const deduped = new Map<string, T>();
  for (const exec of executions) {
    const key = exec.id || `__no_id_${noIdCounter++}`;
    deduped.set(key, exec);
  }
  return Array.from(deduped.values());
}

export function resolveImageFromDom(
  refOrId: string | { id: string; storage?: 'inline' | 'file'; path?: string },
): string {
  const id = typeof refOrId === 'string' ? refOrId : refOrId.id;
  const cached = imageCache.get(id);
  if (cached) return cached;

  const el = document.querySelector(
    `script[type="midscene-image"][data-id="${CSS.escape(id)}"]`,
  );
  if (el?.textContent) {
    const data = antiEscapeScriptTag(el.textContent);
    imageCache.set(id, data);
    return data;
  }

  if (typeof refOrId === 'object' && refOrId?.storage === 'file') {
    return refOrId.path || `./screenshots/${id}.png`;
  }
  // Fallback to directory path
  return `./screenshots/${id}.png`;
}

/**
 * Group the embedded `<script type="midscene_web_dump">` tags by their
 * `data-group-id`. Current report templates always emit this attribute.
 */
export function groupDumpScriptElements(): Map<string, Element[]> {
  const validElements = Array.from(
    document.querySelectorAll('script[type="midscene_web_dump"]'),
  ).filter((el) => !!el.textContent?.trim());

  const groupMap = new Map<string, Element[]>();
  for (const el of validElements) {
    const groupId = el.getAttribute('data-group-id');
    if (!groupId) {
      throw new Error(
        'report dump script is missing data-group-id; regenerate the report with the current Midscene template',
      );
    }
    const decodedGroupId = decodeURIComponent(groupId);
    if (!groupMap.has(decodedGroupId)) {
      groupMap.set(decodedGroupId, []);
    }
    groupMap.get(decodedGroupId)!.push(el);
  }
  return groupMap;
}

/**
 * Parse one group's dump elements into a single deduped {@link GroupedActionDump}.
 * Executions with a stable id are deduplicated (keeping the latest); old-format
 * entries without an id are always kept.
 */
export function parseDumpGroup(elements: Element[]): GroupedActionDump {
  const allExecutions: GroupedActionDump['executions'] = [];
  let baseDump: GroupedActionDump | null = null;

  for (const el of elements) {
    const content = antiEscapeScriptTag(el.textContent || '');
    const restored = restoreImageReferences(
      JSON.parse(content),
      resolveImageFromDom,
    );
    const dump = GroupedActionDump.fromJSON(restored);
    if (!baseDump) baseDump = dump;
    allExecutions.push(...dump.executions);
  }

  if (!baseDump) {
    throw new Error('parseDumpGroup: no dump elements to parse');
  }
  baseDump.executions = dedupeExecutionsKeepLatest(allExecutions);
  return baseDump;
}

/** Read all embedded dumps as one {@link GroupedActionDump} per group. */
export function readReportDumpGroups(): GroupedActionDump[] {
  return Array.from(groupDumpScriptElements().values()).map(parseDumpGroup);
}
