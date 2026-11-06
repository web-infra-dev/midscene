import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from '@rstest/core';

// The collector uses Unix resource accounting and only runs in Linux CI.
it.skipIf(process.platform !== 'linux')(
  'records measurements without hiding a failing test command or its output',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-measure-'));
    try {
      const output = join(root, 'resources.json');
      const result = spawnSync(
        'python3',
        [
          new URL('../ci-measure.py', import.meta.url).pathname,
          output,
          process.execPath,
          '-e',
          'console.log("test output"); process.exit(7)',
        ],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(7);
      expect(result.stdout).toContain('test output');
      const measurement = JSON.parse(readFileSync(output, 'utf8'));
      expect(measurement.exit_code).toBe(7);
      expect(measurement.elapsed_seconds).toBeGreaterThan(0);
      expect(measurement.user_cpu_seconds).toBeGreaterThanOrEqual(0);
      expect(measurement.max_child_rss_kib).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
