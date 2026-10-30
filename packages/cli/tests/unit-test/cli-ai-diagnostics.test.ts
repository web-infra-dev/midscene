import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from '@rstest/core';
import {
  cliAiBudget,
  cliAiModelEnv,
  runCliWithDiagnostics,
} from '../ai/cli-process';

const roots: string[] = [];
const directory = () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-ai-diagnostics-'));
  roots.push(root);
  return root;
};
const status = (root: string) =>
  JSON.parse(readFileSync(join(root, 'process.json'), 'utf8'));

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('CLI AI subprocess diagnostics', () => {
  test('retains stdout, stderr and exit status without exporting environment values', async () => {
    const root = directory();
    const result = await runCliWithDiagnostics(
      process.execPath,
      [
        '-e',
        `
      process.stdout.write(process.env.DIAGNOSTIC_SENTINEL);
      process.stderr.write('request completed');
    `,
      ],
      {
        directory: root,
        timeoutMs: 5_000,
        env: {
          DIAGNOSTIC_SENTINEL: 'child-output',
          MIDSCENE_MODEL_API_KEY: 'test-secret-not-for-artifacts',
        },
      },
    );
    expect(result.stdout).toBe('child-output');
    expect(readFileSync(join(root, 'stdout.log'), 'utf8')).toBe('child-output');
    expect(readFileSync(join(root, 'stderr.log'), 'utf8')).toBe(
      'request completed',
    );
    expect(status(root)).toMatchObject({ status: 'passed', exitCode: 0 });
    expect(readFileSync(join(root, 'process.json'), 'utf8')).not.toContain(
      'test-secret-not-for-artifacts',
    );
  });

  test('retains partial output and the timeout before an outer test can retry', async () => {
    const root = directory();
    await expect(
      runCliWithDiagnostics(
        process.execPath,
        [
          '-e',
          `
      process.stdout.write('login started');
      process.stderr.write('waiting on model');
      setInterval(() => {}, 1000);
    `,
        ],
        { directory: root, timeoutMs: 1_000 },
      ),
    ).rejects.toMatchObject({ timedOut: true });
    expect(status(root)).toMatchObject({
      status: 'failed',
      timedOut: true,
      signal: 'SIGKILL',
    });
    expect(readFileSync(join(root, 'stdout.log'), 'utf8')).toBe(
      'login started',
    );
    expect(readFileSync(join(root, 'stderr.log'), 'utf8')).toBe(
      'waiting on model',
    );
  });

  test('preserves a normal nonzero exit as an execution failure', async () => {
    const root = directory();
    await expect(
      runCliWithDiagnostics(
        process.execPath,
        ['-e', "process.stderr.write('model failed');process.exitCode=3"],
        { directory: root, timeoutMs: 5_000 },
      ),
    ).rejects.toMatchObject({ exitCode: 3 });
    expect(status(root)).toMatchObject({
      status: 'failed',
      exitCode: 3,
      timedOut: false,
    });
    expect(readFileSync(join(root, 'stderr.log'), 'utf8')).toBe('model failed');
  });

  test('keeps all model slots inside the CLI deadline and reserves time for test cleanup', () => {
    const attempts = Number(cliAiModelEnv.MIDSCENE_MODEL_RETRY_COUNT) + 1;
    const retries =
      Number(cliAiModelEnv.MIDSCENE_MODEL_RETRY_INTERVAL) * (attempts - 1);
    for (const timeout of [
      cliAiModelEnv.MIDSCENE_MODEL_TIMEOUT,
      cliAiModelEnv.MIDSCENE_PLANNING_MODEL_TIMEOUT,
      cliAiModelEnv.MIDSCENE_LOCATE_MODEL_TIMEOUT,
      cliAiModelEnv.MIDSCENE_INSIGHT_MODEL_TIMEOUT,
    ]) {
      expect(Number(timeout) * attempts + retries).toBe(
        cliAiBudget.modelCallMs,
      );
    }
    expect(cliAiBudget.modelCallMs).toBeLessThan(cliAiBudget.commandMs);
    expect(cliAiBudget.commandMs + 30_000).toBeLessThan(cliAiBudget.testMs);
  });
});
