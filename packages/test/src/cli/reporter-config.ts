import type { TestRunReportDump } from '@midscene/core';
import type { TestReporterEvent } from './reporter-events';
import type { TestProjectRunResult } from './types';

/** Additional result formats. The existing terminal, HTML and Markdown outputs remain unchanged. */
export type BuiltinTestReporter = 'junit' | 'json';

export interface TestReporterOptions {
  /** Absolute path, or a path relative to the per-run results directory. */
  outputFile?: string;
}

export interface TestReporterContext {
  /** Completed run, including errors recorded while publishing earlier artifacts. */
  result: TestProjectRunResult;
  /** Sanitized report model shared by the built-in result formatters. */
  dump: TestRunReportDump;
  /** Directory containing this run's summary.json. */
  outputDir: string;
}

/** A custom reporter can be supplied directly from midscene.config.ts or the SDK. */
export interface TestReporter {
  name: string;
  /** Event handlers may overlap. Pending handlers settle before publication. */
  onEvent?(event: TestReporterEvent): void | Promise<void>;
  /** Return an absolute or outputDir-relative artifact path to include it in summary.json. */
  onFinished?(
    context: TestReporterContext,
  ): string | void | Promise<string | undefined> | Promise<void>;
}

export type TestReporterEntry =
  | BuiltinTestReporter
  | readonly [BuiltinTestReporter, TestReporterOptions]
  | TestReporter;

export interface TestReporterFailure {
  name: string;
  error: unknown;
}

export interface TestReporterArtifact {
  name: string;
  path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const builtin = (value: unknown): value is BuiltinTestReporter =>
  value === 'junit' || value === 'json';

/** Validate both config and SDK overrides at the execution boundary. */
export function validateTestReporters(
  value: unknown,
): readonly TestReporterEntry[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value))
    throw new TypeError('Midscene config reporters must be an array.');

  return Object.freeze(
    value.map((candidate, index): TestReporterEntry => {
      const label = `reporters[${index}]`;
      if (builtin(candidate)) return candidate;
      if (Array.isArray(candidate)) {
        if (
          candidate.length !== 2 ||
          !builtin(candidate[0]) ||
          !isRecord(candidate[1])
        )
          throw new TypeError(
            `Midscene config ${label} must be [junit|json, options].`,
          );
        const options = candidate[1];
        const unknown = Object.keys(options).find(
          (key) => key !== 'outputFile',
        );
        if (unknown)
          throw new TypeError(
            `Midscene config ${label}.${unknown} is not supported.`,
          );
        if (
          options.outputFile !== undefined &&
          (typeof options.outputFile !== 'string' || !options.outputFile.trim())
        )
          throw new TypeError(
            `Midscene config ${label}.outputFile must be a non-empty string.`,
          );
        return Object.freeze([
          candidate[0],
          Object.freeze({
            ...(options.outputFile === undefined
              ? {}
              : { outputFile: options.outputFile }),
          }),
        ] as const);
      }
      if (isRecord(candidate)) {
        if (
          typeof candidate.name !== 'string' ||
          !candidate.name.trim() ||
          (typeof candidate.onEvent !== 'function' &&
            typeof candidate.onFinished !== 'function')
        )
          throw new TypeError(
            `Midscene config ${label} must have a name and onEvent or onFinished callback.`,
          );
        if (
          candidate.onEvent !== undefined &&
          typeof candidate.onEvent !== 'function'
        )
          throw new TypeError(
            `Midscene config ${label}.onEvent must be a function.`,
          );
        if (
          candidate.onFinished !== undefined &&
          typeof candidate.onFinished !== 'function'
        )
          throw new TypeError(
            `Midscene config ${label}.onFinished must be a function.`,
          );
        return candidate as unknown as TestReporter;
      }
      throw new TypeError(
        `Midscene config ${label} is not a supported reporter.`,
      );
    }),
  );
}

export function isCustomTestReporter(
  entry: TestReporterEntry,
): entry is TestReporter {
  return typeof entry === 'object' && !Array.isArray(entry);
}
