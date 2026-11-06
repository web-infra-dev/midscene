import { NodeExecutionError } from '@midscene/core/internal/test-runner';
import { describe, expect, it } from 'vitest';
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

  it('redacts credentials and limits failed input fields and lengths', () => {
    const rows = formatFailureInput({
      outcome: 'final-failure',
      apiKey: 'private-api-key',
      headers: { Authorization: 'Bearer private-token' },
      prompt: 'x'.repeat(1000),
      extra: 'not printed',
    });
    expect(rows.join('\n')).toContain('outcome: final-failure');
    expect(rows.join('\n')).toContain('[REDACTED]');
    expect(rows.join('\n')).not.toMatch(/private|not printed/);
    expect(rows).toHaveLength(5);
    expect(rows[3].length).toBeLessThan(180);
    expect(rows[4]).toBe('… 1 more fields (see Summary)');
    expect(formatFailureInput({})).toEqual([]);
    expect(formatFailureInput(undefined)).toEqual([]);
    expect(formatFailureInput('password=private-value')).toEqual([
      'password=[REDACTED]',
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
});
