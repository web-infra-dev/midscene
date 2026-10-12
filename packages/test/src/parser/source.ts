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
}

/** Keep author formatting while redacting values by parsed YAML keys, including aliases. */
export function parseWorkflowSource(source: string): {
  parsed: unknown;
  sourceYaml: TestRunReportValue;
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
        });
        return;
      }
      const node = stack.pop()!;
      node.end = state.position + sourceOffset;
      node.value = state.result;
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
    sourceYaml: {
      value,
      ...(redactedPaths.size ? { redactedPaths: [...redactedPaths] } : {}),
      ...(value !== redacted ? { truncatedPaths: ['$'] } : {}),
    },
  };
}
