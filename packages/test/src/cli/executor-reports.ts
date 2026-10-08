import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { WorkflowReportSource } from '@midscene/core/internal/test-runner';
import { TestExecutorError } from './test-executor';

/** Owns the local artifacts behind opaque, task-scoped transport references. */
export function createExecutorReports(outputDir: string) {
  const paths = new Map<string, string>();
  const sources = new Map<string, WorkflowReportSource>();
  return {
    // Native Agent scopes own immutable snapshots, even when no HTML was emitted.
    // Register only trusted local sources; the transport still carries opaque IDs.
    materializeSource(source: WorkflowReportSource): string {
      const dump = realpathSync(source.dumpPath);
      const reference = randomUUID();
      const destination = join(outputDir, 'reports', reference);
      mkdirSync(destination, { recursive: true });
      const dumpPath = join(destination, 'snapshot.json');
      cpSync(dump, dumpPath);
      const screenshots = join(dirname(dump), 'screenshots');
      if (existsSync(screenshots))
        cpSync(screenshots, join(destination, 'screenshots'), {
          recursive: true,
          dereference: true,
        });
      const sourcePath = join(destination, 'index.html');
      sources.set(reference, { sourcePath, dumpPath });
      paths.set(reference, sourcePath);
      return reference;
    },
    resolveSource(reference: string): WorkflowReportSource | undefined {
      return sources.get(reference);
    },
    materialize(sourcePath: string): string {
      const source = realpathSync(sourcePath);
      const entry = statSync(source).isDirectory()
        ? join(source, 'index.html')
        : source;
      if (!statSync(entry).isFile()) {
        throw new TestExecutorError(
          `Executor report must have a regular HTML entry: ${sourcePath}`,
          { kind: 'report' },
        );
      }
      const reference = randomUUID();
      const destination = join(outputDir, 'reports', reference);
      mkdirSync(destination, { recursive: true });
      // Directory reports need their sibling screenshots as well as index.html.
      const isDirectoryReport = basename(entry) === 'index.html';
      const reportPath = join(
        destination,
        isDirectoryReport ? 'index.html' : 'report.html',
      );
      cpSync(
        isDirectoryReport ? dirname(entry) : entry,
        isDirectoryReport ? destination : reportPath,
        {
          recursive: isDirectoryReport,
          dereference: true,
        },
      );
      paths.set(reference, reportPath);
      return reference;
    },
    resolve(reference: string): string {
      const reportPath = paths.get(reference);
      if (!reportPath) {
        throw new TestExecutorError(
          `Executor returned unknown report reference ${reference}.`,
          { kind: 'report' },
        );
      }
      return reportPath;
    },
  };
}
