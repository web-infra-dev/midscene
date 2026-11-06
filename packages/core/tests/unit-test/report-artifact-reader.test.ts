import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  readReportActionDump,
  readReportArtifactManifestAsync,
} from '@/dump/report-artifact-reader';
import { ReportGenerator } from '@/report-generator';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  createExecution,
  defaultReportMeta,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';

let root: string;
beforeEach(() => {
  root = getReportGeneratorTmpDir('artifact-reader');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('async report replay reader', () => {
  it.each(['inline', 'directory'] as const)(
    'reads all %s executions, retaining latest progress and skipping Viewer script strings',
    async (mode) => {
      const path = join(
        root,
        mode === 'directory' ? 'index.html' : 'report.html',
      );
      const generator = new ReportGenerator({
        reportPath: path,
        screenshotMode: mode,
        autoPrint: false,
      });
      const first = createExecution([], 'before update', 'first');
      generator.onExecutionUpdate(first, defaultReportMeta);
      await generator.flush();
      first.name = 'after update </script> 中文';
      generator.onExecutionUpdate(first, defaultReportMeta);
      generator.onExecutionUpdate(
        createExecution([], 'second', 'second'),
        defaultReportMeta,
      );
      await generator.finalize();
      const dump = await readReportActionDump(path);
      expect(dump.executions.map(({ id, name }) => ({ id, name }))).toEqual([
        { id: 'first', name: 'after update </script> 中文' },
        { id: 'second', name: 'second' },
      ]);
      expect(Boolean(await readReportArtifactManifestAsync(path))).toBe(
        mode === 'directory',
      );
      expect(readFileSync(path, 'utf8')).toContain('<!doctype html>');
    },
  );
});
