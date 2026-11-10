import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { TestRunReportDump } from '@midscene/core';
import { renderTestResultJUnit } from '../report/result-junit';
import {
  type BuiltinTestReporter,
  type TestReporter,
  type TestReporterArtifact,
  type TestReporterContext,
  type TestReporterEntry,
  type TestReporterFailure,
  isCustomTestReporter,
} from './reporter-config';
import type { TestReporterEvent } from './reporter-events';

const formats = {
  junit: { file: 'junit.xml', render: renderTestResultJUnit },
  json: {
    file: 'result.json',
    render: (dump: TestRunReportDump) => `${JSON.stringify(dump, null, 2)}\n`,
  },
};

interface Registration {
  reporter: TestReporter;
  builtin?: BuiltinTestReporter;
  output?: string;
}

interface PublishOptions {
  context(): TestReporterContext;
  publish(path: string, write: () => Promise<void>): Promise<boolean>;
  onArtifact(
    artifact: TestReporterArtifact,
    builtin?: BuiltinTestReporter,
  ): void;
}

export function createTestReporters(
  entries: readonly TestReporterEntry[],
  outputDir: string,
  projectDirectories: readonly string[],
) {
  // Reject case-only collisions consistently on developer machines and CI.
  const reserved = [
    'summary.json',
    'result.md',
    'plan.json',
    'operations.jsonl',
    'records',
    ...projectDirectories,
  ];
  const claimed = new Map(
    reserved.map((file) => [join(outputDir, file).toLowerCase(), file]),
  );
  const registrations = entries.map((entry): Registration => {
    if (isCustomTestReporter(entry)) return { reporter: entry };
    const name = typeof entry === 'string' ? entry : entry[0];
    const format = formats[name];
    const output = resolve(
      outputDir,
      (typeof entry === 'string' ? undefined : entry[1].outputFile) ??
        format.file,
    );
    const key = output.toLowerCase();
    for (const [path, owner] of claimed) {
      if (
        path === key ||
        path.startsWith(key + sep) ||
        key.startsWith(path + sep)
      )
        throw new Error(
          `Reporter ${name} output ${output} conflicts with ${owner} (${path}).`,
        );
    }
    claimed.set(key, name);
    return {
      builtin: name,
      output,
      reporter: {
        name,
        async onFinished({ dump }) {
          await mkdir(dirname(output), { recursive: true });
          await writeFile(output, format.render(dump), 'utf8');
          return output;
        },
      },
    };
  });

  const failures: TestReporterFailure[] = [];
  const pending = new Set<Promise<void>>();
  return {
    onEvent(event: TestReporterEvent) {
      for (const { reporter } of registrations) {
        try {
          const completion = reporter.onEvent?.(event);
          if (completion) {
            const tracked = Promise.resolve(completion)
              .catch((error) => {
                failures.push({ name: reporter.name, error });
              })
              .finally(() => pending.delete(tracked));
            pending.add(tracked);
          }
        } catch (error) {
          failures.push({ name: reporter.name, error });
        }
      }
    },
    async finish({ context, publish, onArtifact }: PublishOptions) {
      await Promise.all(pending);
      for (const { name, error } of failures)
        await publish(join(outputDir, `reporter-event-${name}`), async () => {
          throw error;
        });

      for (const { reporter, builtin, output } of registrations) {
        if (!reporter.onFinished) continue;
        await publish(
          output ?? join(outputDir, `reporter-${reporter.name}`),
          async () => {
            const file = await reporter.onFinished!(context());
            if (file === undefined) return;
            if (typeof file !== 'string' || !file.trim())
              throw new TypeError(
                `Reporter ${reporter.name} returned an invalid artifact path.`,
              );
            const path = resolve(outputDir, file);
            if (!(await stat(path)).isFile())
              throw new Error(
                `Reporter ${reporter.name} did not produce a file.`,
              );
            onArtifact({ name: reporter.name, path }, builtin);
          },
        );
      }
    },
  };
}
