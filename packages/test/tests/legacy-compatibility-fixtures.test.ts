import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures/legacy-compatibility');
const testCli = resolve(here, '../bin/midscene-test');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const readJsonLines = (file: string): string[] =>
  readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const prepareFixture = (name: string) => {
  const root = mkdtempSync(join(tmpdir(), `legacy-${name}-`));
  roots.push(root);
  cpSync(join(fixtures, name), root, { recursive: true });
  cpSync(join(fixtures, 'interface.cjs'), join(root, 'interface.cjs'));
  const log = join(root, 'events.jsonl');
  return {
    root,
    log,
    env: {
      ...process.env,
      COMPAT_DEVICE: join(fixtures, 'interface.cjs'),
      COMPAT_ROOT: root,
      COMPAT_LOG: log,
      MIDSCENE_RUN_DIR: join(root, 'midscene_run'),
      MIDSCENE_MODEL_NAME: 'test',
      MIDSCENE_MODEL_API_KEY: 'test',
      MIDSCENE_REPORT_QUIET: '1',
      CI: '1',
    },
  };
};

const runFixture = (
  fixture: ReturnType<typeof prepareFixture>,
  args: string[],
  cwd = fixture.root,
) => {
  const summaryPath = join(fixture.root, 'summary.json');
  execFileSync(process.execPath, [testCli, ...args, '--summary', summaryPath], {
    cwd,
    env: fixture.env,
    timeout: 20_000,
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(summaryPath, 'utf8'));
};

describe('legacy YAML fixtures migrated from midscene-demo', () => {
  it('preserves falsy, unnamed and overwritten JavaScript results', () => {
    const fixture = prepareFixture('outputs-scalars');
    const summary = runFixture(fixture, ['flow.yaml']);

    expect(summary.results.map((result: any) => result.resultType)).toEqual([
      'success',
    ]);
    expect(
      JSON.parse(readFileSync(join(fixture.root, 'output.json'), 'utf8')),
    ).toEqual({
      1: 7,
      2: 9,
      zero: 8,
      flag: false,
      nil: null,
      empty: '',
    });
    expect(readJsonLines(fixture.log)).toEqual([
      'device:created',
      'device:destroyed',
    ]);
  });

  it('preserves task continuation, whole-file retry and next-file admission', () => {
    const fixture = prepareFixture('policy-task1-batch1-retry1');
    const summary = runFixture(fixture, ['--config', 'batch.yaml']);

    expect(summary.results.map((result: any) => result.resultType)).toEqual([
      'success',
      'success',
    ]);
    expect(
      summary.results.map((result: any) =>
        result.attempts.map((attempt: any) => attempt.resultType),
      ),
    ).toEqual([['partialFailed', 'success'], ['success']]);
    const events = readJsonLines(fixture.log);
    expect(events.filter((event) => !event.startsWith('device:'))).toEqual([
      'start',
      'next-task',
      'start',
      'after-step',
      'next-task',
      'next-file',
    ]);
    expect(events.filter((event) => event === 'device:created')).toHaveLength(
      3,
    );
    expect(events.filter((event) => event === 'device:destroyed')).toHaveLength(
      3,
    );
  });

  it('runs files concurrently with isolated resources and a fresh retry', () => {
    const fixture = prepareFixture('concurrent-isolation-retry1');
    const summary = runFixture(fixture, ['--config', 'batch.yaml']);

    expect(
      summary.results.map((result: any) =>
        result.attempts.map((attempt: any) => attempt.resultType),
      ),
    ).toEqual([['failed', 'success'], ['success']]);
    expect(
      JSON.parse(readFileSync(join(fixture.root, 'a.json'), 'utf8')),
    ).toEqual({ isolated: 1 });
    expect(
      JSON.parse(readFileSync(join(fixture.root, 'b.json'), 'utf8')),
    ).toEqual({ isolated: 1 });
    const events = readJsonLines(fixture.log);
    expect(
      events.filter((event) => !event.startsWith('device:')).sort(),
    ).toEqual(['a', 'b']);
    expect(events.filter((event) => event === 'device:created')).toHaveLength(
      3,
    );
    expect(events.filter((event) => event === 'device:destroyed')).toHaveLength(
      3,
    );
  });

  it('resolves batch globs and Interface modules from their owning directories', () => {
    const fixture = prepareFixture('files-config-different-cwd');
    const launch = join(fixture.root, 'launch');
    mkdirSync(launch);
    writeFileSync(
      join(fixture.root, 'suite/cases/.hidden.yml'),
      'not a valid case',
    );
    mkdirSync(join(fixture.root, 'suite/cases/node_modules'));
    writeFileSync(
      join(fixture.root, 'suite/cases/node_modules/skipped.yml'),
      'not a valid case',
    );
    fixture.env.COMPAT_DEVICE = '../interface.cjs';

    const summary = runFixture(
      fixture,
      ['--config', '../suite/batch.yaml'],
      launch,
    );

    expect(
      summary.results.map((result: any) => basename(result.script)),
    ).toEqual(['a.yml', 'b.yml']);
    const events = readJsonLines(fixture.log);
    expect(events.filter((event) => !event.startsWith('device:'))).toEqual([
      'a',
      'b',
    ]);
  });
});
