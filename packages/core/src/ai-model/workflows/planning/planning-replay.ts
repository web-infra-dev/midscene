import { type PlanningAblation, planningPartEnabled } from './ablation';

const componentTags = {
  planningText: ['planning'],
  memory: ['memory'],
  subGoals: ['update-plan-content', 'mark-sub-goal-done', 'sub-goal'],
  log: ['log'],
} as const;

// Only framework fields are filtered. User values in action JSON and terminal
// results may contain identical tag strings and must remain byte-for-byte intact.
const protectedTags = new Set([
  'action-type',
  'action-param-json',
  'complete',
  'error',
]);
const frameworkTag =
  /<\/?(planning|memory|update-plan-content|mark-sub-goal-done|sub-goal|log|action-type|action-param-json|complete|error)\b[^>]*>/gi;

function protectedContentEnd(
  content: string,
  start: number,
  tag: string,
): number {
  const closing = `</${tag}>`;
  const lowerContent = content.toLowerCase();
  if (tag !== 'action-param-json') {
    const end = lowerContent.indexOf(closing, start);
    if (end >= 0) return end + closing.length;
    const nextTag = content.indexOf('<', start);
    return nextTag < 0 ? content.length : nextTag;
  }

  // JSON strings can themselves contain </action-param-json> and framework
  // tags. Respect quoted strings rather than treating those as XML boundaries.
  let quote: string | undefined;
  let escaped = false;
  let depth = 0;
  let jsonStarted = false;
  for (let i = start; i < content.length; i++) {
    const character = content[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
    } else if (lowerContent.startsWith(closing, i)) {
      return i + closing.length;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{' || character === '[') {
      jsonStarted = true;
      depth++;
    } else if (character === '}' || character === ']') {
      depth--;
      if (jsonStarted && depth === 0) {
        // Keep the XML terminator when present; otherwise leave subsequent
        // framework fields to the outer scanner.
        const afterJson = content.slice(i + 1);
        const terminator = /^\s*<\/action-param-json>/i.exec(afterJson);
        return i + 1 + (terminator?.[0].length ?? 0);
      }
    }
  }
  throw new Error(
    'Cannot safely filter Planning fields: unterminated action-param-json payload.',
  );
}

/** Remove disabled framework fields from the next assistant replay, not the dump. */
export function filterPlanningReplay(
  content: string,
  ablation: PlanningAblation,
): string {
  const disabledTags = new Set<string>();
  for (const [part, tags] of Object.entries(componentTags)) {
    if (!planningPartEnabled(ablation, part as keyof typeof componentTags)) {
      for (const tag of tags) disabledTags.add(tag);
    }
  }
  if (!disabledTags.size) return content;

  const tokens = new RegExp(frameworkTag);
  let output = '';
  let cursor = 0;
  let suppressedTag: string | undefined;
  let suppressedDepth = 0;
  for (;;) {
    const match = tokens.exec(content);
    if (!match) break;
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    const selfClosing = match[0].endsWith('/>');
    if (suppressedTag) {
      if (closing && tag === suppressedTag) {
        suppressedDepth--;
        if (suppressedDepth === 0) suppressedTag = undefined;
        cursor = tokens.lastIndex;
        continue;
      }
      // Sub-goals belong to their enclosing plan update. A new top-level
      // field ends a half-open disabled field, so an action is never swallowed.
      if (tag === suppressedTag && !selfClosing) {
        suppressedDepth++;
        continue;
      }
      if (tag === 'sub-goal' || closing) continue;
      // A complete disabled field also owns nested explanatory metadata.
      if (
        !protectedTags.has(tag) &&
        content.toLowerCase().includes(`</${suppressedTag}>`, tokens.lastIndex)
      )
        continue;
      suppressedTag = undefined;
      cursor = match.index;
    }
    output += content.slice(cursor, match.index);
    if (disabledTags.has(tag)) {
      if (!closing && !selfClosing) {
        suppressedTag = tag;
        suppressedDepth = 1;
      }
      cursor = tokens.lastIndex;
    } else if (!closing && !selfClosing && protectedTags.has(tag)) {
      const end = protectedContentEnd(content, tokens.lastIndex, tag);
      output += content.slice(match.index, end);
      cursor = end;
      tokens.lastIndex = end;
    } else {
      output += match[0];
      cursor = tokens.lastIndex;
    }
  }
  if (!suppressedTag) output += content.slice(cursor);
  return output;
}
