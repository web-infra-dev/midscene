import path from 'node:path';
import { describe, expect, test } from '@rstest/core';

import {
  CommandRunnerError,
  DEFAULT_COMMAND_TIMEOUT_MS,
  FakeCommandRunner,
  NodeCommandRunner,
} from '../../src/transport/command-runner';
import { Semaphore } from '../../src/transport/semaphore';

const nodeRunner = new NodeCommandRunner();

describe('NodeCommandRunner', () => {
  test('returns stdout as bytes so binary payloads survive', async () => {
    const result = await nodeRunner.run([
      process.execPath,
      '-e',
      'process.stdout.write(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))',
    ]);

    expect(result.exitCode).toBe(0);
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect([...result.stdout]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  });

  test('reports non-zero exit codes without throwing', async () => {
    const result = await nodeRunner.run([
      process.execPath,
      '-e',
      'process.stderr.write("boom"); process.exit(3)',
    ]);

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('boom');
  });

  test('captures stderr separately from stdout', async () => {
    const result = await nodeRunner.run([
      process.execPath,
      '-e',
      'process.stdout.write("out"); process.stderr.write("err")',
    ]);

    expect(result.stdout.toString('utf8')).toBe('out');
    expect(result.stderr).toBe('err');
  });

  test('passes env and cwd through', async () => {
    const result = await nodeRunner.run(
      [
        process.execPath,
        '-e',
        'process.stdout.write(process.env.MY_FLAG ?? "")',
      ],
      { env: { MY_FLAG: 'midscene' }, cwd: path.resolve(__dirname, '../../') },
    );

    expect(result.stdout.toString('utf8')).toBe('midscene');
  });

  test('kills the process and reports a timeout', async () => {
    const startedAt = Date.now();
    const error = await nodeRunner
      .run([process.execPath, '-e', 'setTimeout(() => {}, 5000)'], {
        timeoutMs: 150,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CommandRunnerError);
    expect((error as CommandRunnerError).kind).toBe('timeout');
    expect((error as CommandRunnerError).timeoutMs).toBe(150);
    expect(Date.now() - startedAt).toBeLessThan(4000);
  });

  test('reports a spawn failure for a missing binary', async () => {
    const error = await nodeRunner
      .run(['midscene-definitely-not-a-real-binary'])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CommandRunnerError);
    expect((error as CommandRunnerError).kind).toBe('spawn-failed');
  });

  test('rejects output that exceeds the stdout budget', async () => {
    const error = await nodeRunner
      .run([process.execPath, '-e', 'process.stdout.write("x".repeat(4096))'], {
        maxStdoutBytes: 128,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CommandRunnerError);
    expect((error as CommandRunnerError).kind).toBe('output-overflow');
  });

  test('rejects an empty argv', async () => {
    await expect(nodeRunner.run([])).rejects.toBeInstanceOf(CommandRunnerError);
  });

  test('defaults to a finite timeout', () => {
    expect(DEFAULT_COMMAND_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('FakeCommandRunner', () => {
  const fixture = () =>
    new FakeCommandRunner([
      {
        match: ['screencap', 'base64'],
        stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
      { match: /input -d 0 tap/, stdout: '' },
      { match: (argv) => argv.includes('exit-1'), exitCode: 1, stderr: 'nope' },
    ]);

  test('matches on argv substrings, regex and predicates', async () => {
    const runner = fixture();

    const screenshot = await runner.run([
      'sh',
      '/data/local/tmp/rish',
      '-c',
      'screencap -p | base64 -w0',
    ]);
    expect([...screenshot.stdout]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const tap = await runner.run(['sh', 'rish', '-c', 'input -d 0 tap 1 2']);
    expect(tap.exitCode).toBe(0);

    const failing = await runner.run(['sh', 'rish', '-c', 'exit-1']);
    expect(failing.exitCode).toBe(1);
    expect(failing.stderr).toBe('nope');

    expect(runner.calls).toHaveLength(3);
    expect(runner.lastCommand).toContain('exit-1');
  });

  test('fails loudly on an unmatched command so drift is visible', async () => {
    const runner = fixture();

    await expect(runner.run(['sh', 'rish', '-c', 'rm -rf /'])).rejects.toThrow(
      /unmatched command/,
    );
  });

  test('honours a scripted failure', async () => {
    const runner = new FakeCommandRunner([
      { match: [], failure: { kind: 'timeout', message: 'too slow' } },
    ]);

    const error = await runner
      .run(['sh', 'rish', '-c', 'anything'])
      .catch((caught: unknown) => caught);

    expect((error as CommandRunnerError).kind).toBe('timeout');
    expect((error as CommandRunnerError).message).toBe('too slow');
  });

  test('records the command string for assertions', async () => {
    const runner = new FakeCommandRunner([{ match: [], stdout: 'ok' }]);
    await runner.run(['sh', 'rish', '-c', 'id -u']);

    expect(runner.commands).toEqual(['sh rish -c id -u']);
  });
});

describe('Semaphore', () => {
  test('caps concurrent work and queues the rest', async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const finished: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5].map((id) =>
        semaphore.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
          finished.push(id);
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(finished.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(semaphore.activeCount).toBe(0);
    expect(semaphore.pendingCount).toBe(0);
  });

  test('releases the slot when the task throws', async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(semaphore.activeCount).toBe(0);
    await expect(semaphore.run(async () => 'ok')).resolves.toBe('ok');
  });

  test('rejects an invalid limit', () => {
    expect(() => new Semaphore(0)).toThrow(/positive integer/);
  });
});
