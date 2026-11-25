import { mkdtemp, rm } from 'node:fs/promises';
import * as actual from 'node:fs/promises' with { rstest: 'importActual' };
import os from 'node:os';
import path from 'node:path';
import { runBenchmark } from '@/benchmark-grounding/core/runner';
import { loadTestcases } from '@/benchmark-grounding/core/testcase';
import { expect, it, rs } from '@rstest/core';
import { fixture } from '../fixture';

let activeFiles = 0;
let peakFiles = 0;

function trackFile<T>(operation: Promise<T>) {
  activeFiles++;
  peakFiles = Math.max(peakFiles, activeFiles);
  return operation.finally(() => activeFiles--);
}

rs.mock('node:fs/promises', () => ({
  ...actual,
  readFile: (...args: Parameters<typeof actual.readFile>) =>
    trackFile(actual.readFile(...args)),
  writeFile: (...args: Parameters<typeof actual.writeFile>) =>
    trackFile(actual.writeFile(...args)),
}));
rs.mock('@midscene/core', () => ({
  Agent: class {
    async aiLocate() {
      return { center: [0, 0] };
    }
    async destroy() {}
  },
}));

it('writes and reloads a full benchmark within a limited file descriptor budget', async () => {
  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'grounding-io-'),
  );
  try {
    const testcases = Array.from({ length: 200 }, (_, index) =>
      fixture(`case-${index.toString().padStart(3, '0')}`),
    );
    const { directory } = await runBenchmark({
      testcases,
      models: [
        {
          name: 'test-model',
          family: 'qwen3',
          baseUrl: 'https://example.invalid',
          apiKey: 'test-key',
        },
      ],
      outputDirectory,
      concurrency: 1,
    });
    expect(peakFiles).toBeGreaterThan(0);
    expect(peakFiles).toBeLessThanOrEqual(64);

    peakFiles = 0;
    const loaded = await loadTestcases({
      directory: path.join(directory, 'testcases'),
    });
    expect(peakFiles).toBeGreaterThan(0);
    expect(peakFiles).toBeLessThanOrEqual(64);
    expect(loaded.map((record) => record.testcaseSha256)).toEqual(
      testcases.map((record) => record.testcaseSha256),
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
