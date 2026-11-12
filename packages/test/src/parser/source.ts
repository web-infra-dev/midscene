import type { TestRunReportValue } from '@midscene/core';
import { sanitizeReportText } from '@midscene/core/internal/test-runner';
import { JSON_SCHEMA, load } from 'js-yaml';

interface SourceNode {
  start: number;
  end: number;
  value: unknown;
  children: SourceNode[];
  kind: string | null;
}

/** Capture author formatting and locate steps in the original source. */
export function parseWorkflowSource(source: string): {
  parsed: unknown;
  sourceYaml: TestRunReportValue;
  locate(
    path: readonly (string | number)[],
  ): { line: number; column: number } | undefined;
} {
  const stack: SourceNode[] = [];
  let root: SourceNode | undefined;
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
      const parent = stack.at(-1);
      if (parent) parent.children.push(node);
      else root = node;
    },
  });
  const value = sanitizeReportText(source, 64 * 1024);
  return {
    parsed,
    locate(path) {
      let node = root;
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
      ...(value !== source ? { truncatedPaths: ['$'] } : {}),
    },
  };
}
