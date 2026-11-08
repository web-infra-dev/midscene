import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamInlineReportImages } from '@/dump/html-utils';
import { readReportDumpScripts } from '@/dump/report-artifact-reader';
import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';

const worker = join(__dirname, 'test-helpers/report-memory-process.cjs');
const entry = require.resolve('@midscene/core');
const MiB = 1024 * 1024;
let fixture: string;
beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'report-memory-fixture-'));
  const child = spawnSync(
    process.execPath,
    [worker, entry, 'fixture', fixture],
    { encoding: 'utf8', timeout: 30_000 },
  );
  expect(child.status, child.stderr).toBe(0);
  expect(statSync(join(fixture, 'source.html')).size).toBeGreaterThan(96 * MiB);
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('report image processing memory budgets', () => {
  it.each([
    'single',
    'external',
    'append',
    'test-single',
    'test-external',
    'record',
    'cases',
  ] as const)(
    'bounds process memory and releases finished records: %s',
    { timeout: 60_000 },
    (operation) => {
      const root = mkdtempSync(join(tmpdir(), 'report-memory-run-'));
      try {
        copyFileSync(join(fixture, 'source.html'), join(root, 'source.html'));
        const child = spawnSync(
          process.execPath,
          [
            '--expose-gc',
            '--max-old-space-size=192',
            worker,
            entry,
            operation,
            root,
          ],
          { encoding: 'utf8', timeout: 45_000, maxBuffer: 1024 * 1024 },
        );
        expect(child.status, child.stderr).toBe(0);
        const result = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
        // Heap limits do not include image Buffers: guard OS peak RSS as well.
        expect(result.peakRssBytes).toBeLessThan(384 * MiB);
        expect(result.retainedHeapBytes).toBeLessThan(
          (operation === 'cases' ? 8 : 32) * MiB,
        );
        const dumps = readReportDumpScripts(result.output);
        if (operation === 'cases') {
          expect(
            dumps.flatMap((dump) => JSON.parse(dump.content).executions),
          ).toHaveLength(24);
          return;
        }
        expect(
          dumps.some((dump) =>
            JSON.parse(dump.content).executions.some(
              (e: any) => e.id === 'source',
            ),
          ),
        ).toBe(true);
        if (operation === 'append')
          expect(
            dumps.some((dump) =>
              JSON.parse(dump.content).executions.some(
                (e: any) => e.id === 'appended',
              ),
            ),
          ).toBe(true);
        if (!operation.endsWith('external')) {
          let images = 0;
          streamInlineReportImages(result.output, () => {
            images++;
            return false;
          });
          expect(images).toBe(
            operation === 'append' ? 97 : operation === 'record' ? 1 : 96,
          );
        }
        console.log(
          `report memory ${operation}: peak RSS ${(result.peakRssBytes / MiB).toFixed(1)} MiB, retained heap ${(result.retainedHeapBytes / MiB).toFixed(1)} MiB`,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
