import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { TestRunReportSourceIndex } from '@midscene/core';
import { renderTestResultJUnit } from '../report/result-junit';
import { buildTestRunReportDump } from '../report/test-run-report';
import {
  isCustomTestReporter,
  type TestReporterArtifact,
  type TestReporterEntry,
  type TestReporterFailure,
} from './reporter-config';
import type { TestReporterEvent } from './reporter-events';
import type { TestProjectRunResult } from './types';

const emptyIndex = (): TestRunReportSourceIndex => ({
  sources: [],
  metrics: {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
});

export function emitConfiguredReporterEvent(
  reporters: readonly TestReporterEntry[],
  failures: TestReporterFailure[],
  event: TestReporterEvent,
): void {
  for (const entry of reporters) {
    if (!isCustomTestReporter(entry) || !entry.onEvent) continue;
    try {
      entry.onEvent(event);
    } catch (error) {
      failures.push({ name: entry.name, error });
    }
  }
}

interface PublishReportersOptions {
  reporters: readonly TestReporterEntry[];
  eventFailures: readonly TestReporterFailure[];
  result(): TestProjectRunResult;
  reportIndex?: TestRunReportSourceIndex;
  /** Uses the runner's existing infrastructure error and exit-code policy. */
  publish(path: string, callback: () => Promise<void>): Promise<boolean>;
  onArtifact(artifact: TestReporterArtifact): void;
}

const filePath = (outputDir: string, configured: string): string =>
  isAbsolute(configured) ? configured : resolve(outputDir, configured);

/** Every reporter is attempted, even when a preceding reporter fails. */
export async function publishConfiguredReporters(options: PublishReportersOptions): Promise<void> {
  const outputDir = dirname(options.result().summaryPath);
  for (const failure of options.eventFailures) {
    await options.publish(join(outputDir, 'reporter-event-' + failure.name), async () => {
      throw failure.error;
    });
  }

  for (const entry of options.reporters) {
    if (isCustomTestReporter(entry)) {
      if (!entry.onFinished) continue;
      let artifactPath: string | undefined;
      const ok = await options.publish(join(outputDir, 'reporter-' + entry.name), async () => {
        const result = options.result();
        const returnedPath = await entry.onFinished!({
          result,
          dump: buildTestRunReportDump(result, options.reportIndex ?? emptyIndex()),
          outputDir,
        });
        if (returnedPath !== undefined) {
          if (typeof returnedPath !== 'string' || !returnedPath.trim())
            throw new TypeError('Reporter ' + entry.name + ' returned an invalid artifact path.');
          artifactPath = filePath(outputDir, returnedPath);
          if (!(await stat(artifactPath)).isFile())
            throw new Error('Reporter ' + entry.name + ' did not produce a file.');
        }
      });
      if (ok && artifactPath) options.onArtifact({ name: entry.name, path: artifactPath });
      continue;
    }

    const [name, config] = typeof entry === 'string'
      ? [entry, {}] as const
      : entry;
    const output = filePath(outputDir, config.outputFile ?? (name === 'junit' ? 'junit.xml' : 'result.json'));
    const ok = await options.publish(output, async () => {
      const dump = buildTestRunReportDump(options.result(), options.reportIndex ?? emptyIndex());
      const text = name === 'junit'
        ? renderTestResultJUnit(dump)
        : JSON.stringify(dump, null, 2) + '\n';
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, text, 'utf8');
    });
    if (ok) options.onArtifact({ name, path: output });
  }
}
