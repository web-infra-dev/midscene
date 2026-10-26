import type { TestRunReportStep } from '@midscene/core';
import { JSON_SCHEMA, load } from 'js-yaml';

type TokenKind = 'key' | 'string' | 'literal' | 'comment';
interface SourceRange {
  start: number;
  end: number;
  kind: TokenKind;
  step?: TestRunReportStep;
}
export interface YamlSourceToken {
  text: string;
  kind?: TokenKind;
  step?: TestRunReportStep;
}

interface SourceNode {
  start: number;
  end: number;
  kind: string;
  value: unknown;
  children: SourceNode[];
}

/** Parse the captured source itself so redaction, comments and formatting keep their positions. */
export function buildYamlSource(
  source: string,
  steps: readonly TestRunReportStep[],
  caseIndex: number,
) {
  const nodes: SourceNode[] = [];
  const stack: SourceNode[] = [];
  const sourceOffset = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let valid = true;
  try {
    load(source, {
      schema: JSON_SCHEMA,
      listener(event, state) {
        if (event === 'open') {
          stack.push({
            start: state.position + sourceOffset,
            end: 0,
            kind: '',
            value: undefined,
            children: [],
          });
        } else {
          const node = stack.pop()!;
          node.end = state.position + sourceOffset;
          node.kind = state.kind;
          node.value = state.result;
          stack.at(-1)?.children.push(node);
          nodes.push(node);
        }
      },
    });
  } catch {
    // Truncated/redacted source must stay readable, without guessed links.
    valid = false;
  }
  const ranges: SourceRange[] = [];
  const keys = new Set<SourceNode>();
  const targets = new Map<SourceNode, TestRunReportStep>();
  const getChild = (node: SourceNode | undefined, key: string | number) => {
    if (node?.kind === 'sequence' && typeof key === 'number')
      return node.children[key];
    if (node?.kind === 'mapping') {
      for (let i = 0; i < node.children.length; i += 2) {
        if (node.children[i].value === key) return node.children[i + 1];
      }
    }
    return undefined;
  };
  for (const node of nodes)
    if (node.kind === 'mapping')
      for (let i = 0; i < node.children.length; i += 2)
        keys.add(node.children[i]);
  if (valid) {
    for (const step of steps) {
      const path =
        step.phase === 'steps'
          ? ['cases', caseIndex, 'steps', step.stepIndex]
          : [step.phase, step.stepIndex];
      const node = path.reduce<SourceNode | undefined>(getChild, nodes.at(-1));
      const key = node?.children.find(
        (child) => keys.has(child) && child.value === step.node,
      );
      if (key) targets.set(key, step);
      else if (
        node?.value &&
        typeof node.value === 'object' &&
        Object.prototype.hasOwnProperty.call(node.value, step.node)
      ) {
        // An alias is linked at its invocation, not at its anchor definition.
        const alias = node.children.at(-1) ?? node;
        if (source.slice(alias.start, alias.end).trim().startsWith('*'))
          targets.set(alias, step);
      }
    }
  }
  for (const node of nodes) {
    if (node.kind !== 'scalar' && !targets.has(node)) continue;
    const raw = source.slice(node.start, node.end);
    let start = node.start + (raw.match(/^(?:\s|#[^\r\n]*)*/)?.[0].length ?? 0);
    const end = node.end - (raw.match(/\s*$/)?.[0].length ?? 0);
    // The block header may have a comment; its body is a single string.
    if (source[start] === '|' || source[start] === '>')
      start = source.indexOf('\n', start) + 1;
    if (start >= end) continue;
    ranges.push({
      start,
      end,
      kind: keys.has(node)
        ? 'key'
        : typeof node.value === 'string'
          ? 'string'
          : 'literal',
      step: targets.get(node),
    });
  }
  ranges.sort((a, b) => a.start - b.start);
  // Comments only occur in gaps outside parsed scalar values.
  let gapStart = 0;
  for (const range of [
    ...ranges,
    { start: source.length, end: source.length },
  ]) {
    const gap = source.slice(gapStart, range.start);
    for (const match of gap.matchAll(/#[^\r\n]*/g)) {
      const start = gapStart + match.index!;
      ranges.push({ start, end: start + match[0].length, kind: 'comment' });
    }
    gapStart = Math.max(gapStart, range.end);
  }
  ranges.sort((a, b) => a.start - b.start);

  let offset = 0;
  let rangeIndex = 0;
  const lines = source.split('\n').map((text, index) => {
    const end = offset + text.length;
    const tokens: YamlSourceToken[] = [];
    let cursor = offset;
    while (ranges[rangeIndex]?.end <= offset) rangeIndex++;
    for (let i = rangeIndex; ranges[i]?.start < end; i++) {
      const range = ranges[i];
      const start = Math.max(cursor, range.start);
      if (start > cursor) tokens.push({ text: source.slice(cursor, start) });
      const stop = Math.min(end, range.end);
      if (stop > start)
        tokens.push({
          text: source.slice(start, stop),
          kind: range.kind,
          step: start === range.start ? range.step : undefined,
        });
      cursor = Math.max(cursor, stop);
    }
    if (cursor < end) tokens.push({ text: source.slice(cursor, end) });
    offset = end + 1;
    return { number: index + 1, tokens };
  });
  return { lines, valid };
}
