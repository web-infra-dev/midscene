import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliJsonOutput } from '@/json-output';
import { describe, expect, rs, test } from '@rstest/core';
import { execa } from 'execa';

rs.setConfig({
  testTimeout: 120 * 1000,
});

const cliRoot = join(__dirname, '../..');
const cliEntry = join(cliRoot, 'dist/lib/index.js');
const fixturesDir = join(__dirname, 'fixtures');

const runBuiltCli = (args: string[], runDir: string) =>
  execa(process.execPath, [cliEntry, ...args], {
    cwd: cliRoot,
    env: {
      ...process.env,
      CI: '1',
      MIDSCENE_RUN_DIR: runDir,
    },
    reject: false,
  });

const parseSingleJsonOutput = (stdout: string): CliJsonOutput =>
  JSON.parse(stdout) as CliJsonOutput;

describe('built CLI JSON output', () => {
  test('writes one completed-run object for a successful YAML execution', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-cli-json-success-'));

    try {
      const result = await runBuiltCli(
        [join(fixturesDir, 'json-success.yaml'), '--json'],
        runDir,
      );
      const output = parseSingleJsonOutput(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(output).toMatchObject({
        schemaVersion: 1,
        kind: 'run',
        ok: true,
        exitCode: 0,
        summary: {
          total: 1,
          successful: 1,
          failed: 0,
          partialFailed: 0,
          notExecuted: 0,
        },
        results: [
          {
            success: true,
            executed: true,
            resultType: 'success',
            error: null,
            output: { heading: 'My App' },
          },
        ],
      });
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  test('writes one completed-run object when YAML execution fails', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-cli-json-failure-'));

    try {
      const result = await runBuiltCli(
        [join(fixturesDir, 'json-failure.yaml'), '--json'],
        runDir,
      );
      const output = parseSingleJsonOutput(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(output).toMatchObject({
        schemaVersion: 1,
        kind: 'run',
        ok: false,
        exitCode: 1,
        summary: {
          total: 1,
          successful: 0,
          failed: 1,
          partialFailed: 0,
          notExecuted: 0,
        },
        results: [
          {
            success: false,
            executed: true,
            resultType: 'failed',
            error: expect.stringContaining('intentional JSON contract failure'),
          },
        ],
      });
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  test('writes one error object when execution cannot start', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'midscene-cli-json-error-'));

    try {
      const result = await runBuiltCli(['--json'], runDir);
      const output = parseSingleJsonOutput(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(output).toEqual({
        schemaVersion: 1,
        kind: 'error',
        ok: false,
        exitCode: 1,
        error: {
          name: 'Error',
          message: 'No script path, files, or config provided',
        },
      });
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});
