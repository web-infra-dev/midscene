import { isAbsolute, relative, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, stripVTControlCharacters } from 'node:util';
import {
  sanitizeReportError,
  sanitizeReportValue,
} from '@midscene/core/internal/test-runner';
import type { StepRunResult } from '@midscene/core/internal/test-runner';
import { formatConciseError } from './error-format';

export interface CliFailureContext {
  projectName?: string;
  caseName?: string;
  sourcePath?: string;
  projectRoot?: string;
  phase?: string;
  step?: StepRunResult;
  stepCount?: number;
  attempt?: { index: number; total: number };
  fileAttempt?: { index: number; total: number };
}

const oneLine = (value: string): string =>
  stripVTControlCharacters(value).replace(/\s+/g, ' ').trim();
const shorten = (value: string, length: number): string => {
  const text = oneLine(value);
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
};

/** Follow original causes first, retaining only application code frames. */
export function firstBusinessFrame(
  error: unknown,
  projectRoot?: string,
): string | undefined {
  const seen = new Set<object>();
  const frames: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 12)
      return;
    seen.add(value);
    const detail = value as {
      cause?: unknown;
      errors?: unknown[];
      stack?: unknown;
    };
    visit(detail.cause, depth + 1);
    if (Array.isArray(detail.errors))
      for (const child of detail.errors.slice(0, 10)) visit(child, depth + 1);
    if (typeof detail.stack !== 'string') return;
    for (const line of detail.stack.split('\n')) {
      if (!line.trim().startsWith('at ')) continue;
      let location = line
        .trim()
        .slice(3)
        .replace(/^async /, '');
      if (location.endsWith(')'))
        location = location.slice(location.lastIndexOf('(') + 1, -1);
      const match = location.match(/^(.*):(\d+):(\d+)$/);
      if (!match) continue;
      let file = match[1];
      if (file.startsWith('file://')) {
        try {
          file = fileURLToPath(file);
        } catch {
          continue;
        }
      }
      const normalized = file.replace(/\\/g, '/');
      if (
        normalized.startsWith('node:') ||
        normalized.includes('/node_modules/') ||
        /(?:^|\/)packages\/(?:core|test|shared|web-integration)\/(?:dist|src)\//.test(
          normalized,
        ) ||
        !/\.[cm]?[jt]sx?$/.test(normalized)
      )
        continue;
      frames.push(`${file}:${match[2]}:${match[3]}`);
    }
  };
  visit(error);
  const chosen = frames[0];
  if (!chosen || !projectRoot) return chosen;
  const match = chosen.match(/^(.*):(\d+):(\d+)$/)!;
  const file = match[1];
  const paths = /^[A-Za-z]:[\\/]/.test(file) ? win32 : { isAbsolute, relative };
  const display = paths.isAbsolute(file)
    ? paths.relative(projectRoot, file)
    : file;
  return `${display.replace(/\\/g, '/')}:${match[2]}:${match[3]}`;
}

/** A few resolved input fields, with the same redaction policy as saved reports. */
export function formatFailureInput(input: unknown): string[] {
  if (input === undefined) return [];
  const value = sanitizeReportValue(input).value;
  const render = (value: unknown) =>
    shorten(
      sanitizeReportError({
        message:
          typeof value === 'string'
            ? value
            : inspect(value, {
                colors: false,
                depth: 2,
                maxArrayLength: 4,
                maxStringLength: 180,
                breakLength: Number.POSITIVE_INFINITY,
                customInspect: false,
                getters: false,
              }),
      }).message,
      160,
    );
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    const rows = entries
      .slice(0, 4)
      .map(([key, value]) => `${shorten(key, 48)}: ${render(value)}`);
    if (entries.length > 4)
      rows.push(`… ${entries.length - 4} more fields (see Summary)`);
    return rows;
  }
  return [render(value)];
}

export function formatFailureDetails(
  source: string,
  error: unknown,
  context: CliFailureContext = {},
): { title: string; body: string[] } {
  const title = context.projectName
    ? `[${oneLine(context.projectName)}] ${oneLine(context.caseName ?? context.sourcePath ?? context.phase ?? source)}`
    : oneLine(source);
  const body: string[] = [];
  const field = (label: string, value: string) =>
    body.push(`  ${label.padEnd(9)}${value}`);
  const step = context.step;
  if (step) {
    const phase = step.phase === 'steps' ? '' : `${step.phase} `;
    const index = step.stepIndex + 1;
    const position =
      context.stepCount === undefined
        ? String(index)
        : `${index}/${Math.max(index, context.stepCount)}`;
    field('Step', `${phase}${position} · ${oneLine(step.node)}`);
  } else if (context.phase) field('Phase', oneLine(context.phase));
  if (context.sourcePath) {
    const location = step?.meta.sourceLocation;
    field(
      'Location',
      `${oneLine(context.sourcePath)}${location ? `:${location.line}` : ''}`,
    );
  }
  for (const [label, attempt] of [
    ['Attempt', context.attempt],
    ['File try', context.fileAttempt],
  ] as const)
    if (attempt && (attempt.total > 1 || attempt.index > 0))
      field(label, `${attempt.index + 1}/${attempt.total}`);
  if (body.length) body.push('');
  const safeMessage = sanitizeReportError({
    message: formatConciseError(error),
  }).message;
  const lines = stripVTControlCharacters(safeMessage).split(/\r?\n/);
  body.push(
    `  Error: ${shorten(lines[0], 320)}`,
    ...lines.slice(1, 6).map((line) => `         ${shorten(line, 320)}`),
  );
  if (lines.length > 6)
    body.push('         … (use --reporter verbose for details)');
  const input = step ? formatFailureInput(step.input) : [];
  if (input.length) {
    body.push('');
    input.forEach((line, index) => field(index === 0 ? 'Input' : '', line));
  }
  const frame = firstBusinessFrame(error, context.projectRoot);
  if (frame) body.push('', `  at ${oneLine(frame)}`);
  return { title, body };
}
