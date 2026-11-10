import { runInNewContext } from 'node:vm';
import { NodeExecutionError } from '@midscene/core/internal/test-runner';
import { describe, expect, it } from '@rstest/core';
import {
  firstBusinessFrame,
  formatFailureDetails,
  formatFailureInput,
} from '../src/cli/failure-format';
import type { StepRunResult } from '../src/engine/types';

const step = (input: unknown): StepRunResult => ({
  phase: 'steps',
  stepIndex: 6,
  node: 'demo.applyProjectOutcome',
  input,
  meta: { continueOnError: false, sourceLocation: { line: 45, column: 9 } },
  status: 'failed',
  continuedAfterError: false,
  error: new NodeExecutionError(
    'demo.applyProjectOutcome',
    new Error('failure'),
  ),
  startedAt: '',
  endedAt: '',
  durationMs: 0,
});

describe('concise failure details', () => {
  it('shows resolved failing input, author location and application frame', () => {
    const cause = new Error('planned final failure on Attempt 2.');
    cause.stack =
      'Error: failure\n    at Object.execute (/demo/midscene.config.ts:112:13)\n    at execute (/repo/packages/test/dist/lib/test-cli.js:1952:91)';
    const error = new NodeExecutionError('demo.applyProjectOutcome', cause);
    const detail = formatFailureDetails('opaque source', error, {
      projectName: 'headphones',
      caseName: 'Case A',
      projectRoot: '/demo',
      sourcePath: 'cases/demo.yaml',
      step: step({ outcome: 'final-failure', caseLabel: 'Case A' }),
      stepCount: 7,
      attempt: { index: 1, total: 2 },
    });
    expect(detail.title).toBe('[headphones] Case A');
    expect(detail.body.join('\n')).toBe(
      [
        '  Step     7/7 · demo.applyProjectOutcome',
        '  Location cases/demo.yaml:45',
        '  Attempt  2/2',
        '',
        '  Error: planned final failure on Attempt 2.',
        '',
        '  Input    outcome: final-failure',
        '           caseLabel: Case A',
        '',
        '  at midscene.config.ts:112:13',
      ].join('\n'),
    );
  });

  it('limits failed input fields and lengths', () => {
    const rows = formatFailureInput({
      outcome: 'final-failure',
      apiKey: 'private-api-key',
      headers: { Authorization: 'Bearer private-token' },
      prompt: 'x'.repeat(1000),
      extra: 'not printed',
    });
    expect(rows.join('\n')).toContain('outcome: final-failure');
    expect(rows.join('\n')).toContain('apiKey: private-api-key');
    expect(rows.join('\n')).not.toContain('not printed');
    expect(rows).toHaveLength(5);
    expect(rows[3].length).toBeLessThan(180);
    expect(rows[4]).toBe('… 1 more fields (see Summary)');
    expect(formatFailureInput({})).toEqual([]);
    expect(formatFailureInput(undefined)).toEqual([]);
    expect(formatFailureInput('password=private-value')).toEqual([
      'password=private-value',
    ]);
  });

  it('separates file attempts and lifecycle scope without fabricating a Step input', () => {
    const detail = formatFailureDetails('source', new Error('cleanup failed'), {
      projectName: 'web',
      sourcePath: 'flow.yaml',
      phase: 'teardown',
      fileAttempt: { index: 1, total: 3 },
    });
    const body = detail.body.join('\n');
    expect(detail.title).toBe('[web] flow.yaml');
    expect(body).toContain('Phase    teardown');
    expect(body).toContain('File try 2/3');
    expect(body).not.toContain('Input');
    expect(body).not.toContain('  Attempt ');
  });

  it('bounds multiline errors and strips terminal control sequences', () => {
    const detail = formatFailureDetails(
      'case\nname',
      new Error(`\x1b[31m${'x'.repeat(600)}\x1b[0m\n${'detail\n'.repeat(20)}`),
    );
    expect(detail.title).toBe('case name');
    expect(detail.body.join('\n')).not.toContain('\x1b');
    expect(detail.body[0].length).toBeLessThan(340);
    expect(detail.body.join('\n')).toContain('use --reporter verbose');
  });
});

describe('first application stack frame', () => {
  it('follows causes and skips dependency, framework and native frames', () => {
    const cause = new Error('original');
    cause.stack = [
      'Error: original',
      ' at run (node:internal/process/task_queues:10:2)',
      ' at dep (/demo/node_modules/pkg/index.js:4:3)',
      ' at engine (/repo/packages/core/src/test-runner/engine/run.ts:7:2)',
      ' at execute (file:///demo/custom%20node.ts:42:5)',
    ].join('\n');
    const wrapper = new Error('wrapper', { cause });
    wrapper.stack = 'Error: wrapper\n at wrapped (/demo/wrapper.ts:5:2)';
    expect(firstBusinessFrame(wrapper, '/demo')).toBe('custom node.ts:42:5');
    cause.cause = wrapper;
    expect(firstBusinessFrame(wrapper, '/demo')).toBe('custom node.ts:42:5');
  });

  it('keeps parentheses that are part of the file path', () => {
    const windows = new Error('failure');
    windows.stack =
      'Error: failure\n at Object.execute (C:\\Program Files (x86)\\demo\\midscene.config.ts:112:13)';
    expect(firstBusinessFrame(windows, 'C:\\Program Files (x86)\\demo')).toBe(
      'midscene.config.ts:112:13',
    );
    const posix = new Error('failure');
    posix.stack =
      'Error: failure\n at async run (/home/me/demo (copy)/nodes/login.ts:7:3)';
    expect(firstBusinessFrame(posix, '/home/me/demo (copy)')).toBe(
      'nodes/login.ts:7:3',
    );
    const esm = new Error('failure');
    esm.stack =
      'Error: failure\n at Module.login (file:///home/me/demo%20(copy)/nodes/login.mjs:1:38)';
    expect(firstBusinessFrame(esm, '/home/me/demo (copy)')).toBe(
      'nodes/login.mjs:1:38',
    );
    const symbol = new Error('failure');
    symbol.stack =
      'Error: failure\n at Object.[Symbol(run)] (/demo/nodes/login.ts:9:1)';
    expect(firstBusinessFrame(symbol, '/demo')).toBe('nodes/login.ts:9:1');
  });

  it('supports Windows paths, aggregate branches and missing stacks', () => {
    const leaf = new Error('failure');
    leaf.stack =
      'Error: failure\n at Object.execute (C:\\demo\\midscene.config.ts:112:13)';
    expect(
      firstBusinessFrame(new AggregateError([leaf], 'aggregate'), 'C:\\demo'),
    ).toBe('midscene.config.ts:112:13');
    expect(firstBusinessFrame(null)).toBeUndefined();
    expect(firstBusinessFrame({ message: 'no stack' })).toBeUndefined();
  });

  it('preserves real V8 locations when function names and paths contain parentheses', () => {
    for (const projectRoot of ['/demo', '/demo (copy)', '/demo (draft']) {
      let failure: unknown;
      try {
        runInNewContext(
          "({ ['run (test)']() { throw new Error('failure'); } })['run (test)']();",
          {},
          { filename: `${projectRoot}/nodes/login.ts` },
        );
      } catch (error) {
        failure = error;
      }
      expect(firstBusinessFrame(failure, projectRoot)).toBe(
        'nodes/login.ts:1:29',
      );
    }
  });

  it('handles parenthesized names with Windows, URL and relative locations', () => {
    for (const [location, projectRoot, expected] of [
      ['C:\\demo (copy)\\nodes\\login.ts', 'C:\\demo (copy)', 'nodes/login.ts'],
      [
        'file:///demo%20(copy)/nodes/login.mjs',
        '/demo (copy)',
        'nodes/login.mjs',
      ],
      ['nodes/login (copy).ts', undefined, 'nodes/login (copy).ts'],
    ]) {
      const error = {
        stack: `Error: failure\n at run (test) (${location}:7:3)`,
      };
      expect(firstBusinessFrame(error, projectRoot)).toBe(`${expected}:7:3`);
    }
  });

  it('skips long malformed frames and retains the next application frame', () => {
    const error = {
      stack: [
        'Error: failure',
        ` at ${' (/'.repeat(100_000)}invalid)`,
        ' at run (/demo/nodes/login.ts:7:3)',
      ].join('\n'),
    };
    expect(firstBusinessFrame(error, '/demo')).toBe('nodes/login.ts:7:3');
  });
});
