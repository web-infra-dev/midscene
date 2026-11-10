import type { TestRunReportValue } from '@midscene/core';
import {
  isReportSecretKey,
  sanitizeReportText,
} from '@midscene/core/internal/test-runner';
import { JSON_SCHEMA, load } from 'js-yaml';

interface SourceNode {
  start: number;
  end: number;
  value: unknown;
  children: SourceNode[];
  kind: string | null;
}

/** Keep author formatting while redacting values by parsed YAML keys, including aliases. */
export function parseWorkflowSource(source: string): {
  parsed: unknown;
  sourceYaml: TestRunReportValue;
  locate(
    path: readonly (string | number)[],
  ): { line: number; column: number } | undefined;
} {
  const stack: SourceNode[] = [];
  const nodes: SourceNode[] = [];
  const sensitiveNodes = new Set<SourceNode>();
  const sensitiveValues = new Set<unknown>();
  const redactedPaths = new Set<string>();
  // js-yaml removes the BOM before reporting source positions.
  const sourceOffset = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const parsed = load(source, {
    schema: JSON_SCHEMA,
    listener(event, state) {
      if (event === 'open') {
        stack.push({
          start: state.position + sourceOffset,
          end: 0,
          value: null,
          children: [],
          kind: null,
        });
        return;
      }
      const node = stack.pop()!;
      node.end = state.position + sourceOffset;
      node.value = state.result;
      node.kind = state.kind;
      stack.at(-1)?.children.push(node);
      nodes.push(node);
      if (state.kind !== 'mapping') return;
      for (let index = 0; index < node.children.length; index += 2) {
        const key = node.children[index].value;
        const value = node.children[index + 1];
        if (typeof key !== 'string' || !isReportSecretKey(key) || !value)
          continue;
        sensitiveNodes.add(value);
        if (value.value !== null) sensitiveValues.add(value.value);
        redactedPaths.add(`$..[${JSON.stringify(key)}]`);
      }
    },
  });
  // Redact the definition as well when a secret value refers to a YAML anchor.
  const ranges = nodes
    .filter(
      (node) => sensitiveNodes.has(node) || sensitiveValues.has(node.value),
    )
    .sort((left, right) => left.start - right.start || right.end - left.end);
  let offset = 0;
  let redacted = '';
  for (const range of ranges) {
    if (range.start < offset) continue;
    const text = source.slice(range.start, range.end);
    const leading = text.match(/^\s*/)?.[0] ?? '';
    const trailing = text.slice(leading.length).match(/\s*$/)?.[0] ?? '';
    redacted += `${source.slice(offset, range.start)}${leading}"[REDACTED]"${trailing}`;
    offset = range.end;
  }
  redacted += source.slice(offset);
  const value = sanitizeReportText(redacted, 64 * 1024);
  return {
    parsed,
    locate(path) {
      let node = nodes.at(-1);
      for (const part of path) {
        if (!node) return undefined;
        // js-yaml can emit a wrapper around a block collection.
        while (
          node.children.length === 1 &&
          node.children[0].value === node.value
        )
          node = node.children[0];
        if (typeof part === 'number' && node.kind === 'sequence')
          node = node.children[part];
        else if (typeof part === 'string' && node.kind === 'mapping') {
          const children = node.children;
          node = undefined;
          for (let index = 0; index < children.length; index += 2)
            if (children[index].value === part) {
              node = children[index + 1];
              break;
            }
        } else return undefined;
      }
      if (!node) return undefined;
      let start = node.start;
      while (start < node.end) {
        if (/\s/.test(source[start])) start++;
        else if (source[start] === '#') {
          const end = source.indexOf('\n', start);
          if (end < 0) return undefined;
          start = end + 1;
        } else break;
      }
      const prefix = source.slice(0, start).split(/\r\n|\r|\n/);
      return { line: prefix.length, column: prefix.at(-1)!.length + 1 };
    },
    sourceYaml: {
      value,
      ...(redactedPaths.size ? { redactedPaths: [...redactedPaths] } : {}),
      ...(value !== redacted ? { truncatedPaths: ['$'] } : {}),
    },
  };
}
