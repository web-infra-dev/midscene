import type { TestRunReportStep } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { buildYamlSource } from './yaml-source';

const step = (
  id: string,
  phase: TestRunReportStep['phase'],
  stepIndex = 0,
): Extract<TestRunReportStep, { status: 'success' | 'failed' }> => ({
  id,
  phase,
  stepIndex,
  node: 'repro.check',
  status: 'success',
  continuedAfterError: false,
  startedAt: '2026-10-10T00:00:00Z',
  endedAt: '2026-10-10T00:00:01Z',
  durationMs: 1_000,
});

describe('YAML source annotations', () => {
  it('matches repeated node names by phase, case and step index', () => {
    const source = `beforeAll:
  - repro.check: {title: setup}
beforeEach:
  - repro.check: {title: reset}
cases:
  - name: First case
    steps:
      - repro.check: {title: first case}
  - name: Second case
    steps:
      - $: {continue-on-error: true}
        repro.check: {title: inventory}
      - repro.check: {title: payment}
afterEach:
  - repro.check: {title: cleanup}
afterAll:
  - repro.check: {title: teardown}
`;
    const steps = [
      step('setup', 'beforeAll'),
      step('reset', 'beforeEach'),
      step('inventory', 'steps'),
      { ...step('payment', 'steps', 1), status: 'failed' as const },
      step('cleanup', 'afterEach'),
      step('teardown', 'afterAll'),
    ];
    const { lines } = buildYamlSource(source, steps, 1);
    const targets = lines.flatMap((line) =>
      line.tokens.flatMap((token) =>
        token.step ? [[line.number, token.step.id]] : [],
      ),
    );
    expect(targets).toEqual([
      [2, 'setup'],
      [4, 'reset'],
      [12, 'inventory'],
      [13, 'payment'],
      [15, 'cleanup'],
      [17, 'teardown'],
    ]);
    expect(
      buildYamlSource(source, [steps[3]], 1).lines[12].tokens.find(
        (token) => token.step,
      )?.step?.status,
    ).toBe('failed');
    expect(
      buildYamlSource(
        source,
        [{ ...steps[3], id: 'retry', status: 'success' }],
        1,
      ).lines[12].tokens.find((token) => token.step)?.step?.id,
    ).toBe('retry');
  });

  it('preserves comments, multiline prompts, placeholders, CRLF and escaped content', () => {
    const source = `# Original comment
cases:
  - name: Search
    steps:
      - repro.check:
          prompt: | # prompt comment
            # This is prompt text, not a comment
            - repro.check: <script>alert("x")</script>
          text: "# literal \${keyword}"
          count: 2
          enabled: true
`.replace(/\n/g, '\r\n');
    const { lines, valid } = buildYamlSource(
      source,
      [step('search', 'steps')],
      0,
    );
    expect(valid).toBe(true);
    expect(
      lines
        .map((line) => line.tokens.map((token) => token.text).join(''))
        .join('\n'),
    ).toBe(source);
    expect(
      lines.flatMap((line) => line.tokens).filter((token) => token.step),
    ).toHaveLength(1);
    const tokens = lines.flatMap((line) => line.tokens);
    expect(
      tokens
        .filter((token) => token.kind === 'comment')
        .map((token) => token.text),
    ).toEqual(['# Original comment', '# prompt comment']);
    expect(
      tokens.find((token) => token.text.includes('# This is prompt text'))
        ?.kind,
    ).toBe('string');
    expect(
      tokens
        .filter((token) => token.kind === 'literal')
        .map((token) => token.text),
    ).toEqual(['2', 'true']);
  });

  it('marks alias invocations at their own source position', () => {
    const source = `beforeAll:
  - &check {repro.check: ready}
cases:
  - name: Aliased step
    steps: [*check]
`;
    const { lines } = buildYamlSource(
      source,
      [step('setup', 'beforeAll'), step('case', 'steps')],
      0,
    );
    expect(lines[1].tokens.find((token) => token.step)?.step?.id).toBe('setup');
    expect(lines[4].tokens.find((token) => token.step)?.text).toBe('*check');
    expect(lines[4].tokens.find((token) => token.step)?.step?.id).toBe('case');
  });

  it('does not invent step markers for invalid snapshots or unmatched nodes', () => {
    const invalid = buildYamlSource('cases: [\n', [step('x', 'steps')], 0);
    expect(invalid.valid).toBe(false);
    expect(
      invalid.lines.flatMap((line) => line.tokens).some((token) => token.step),
    ).toBe(false);
    const unmatched = buildYamlSource(
      'cases: [{steps: [{aiAct: click}]}]',
      [step('x', 'steps')],
      0,
    );
    expect(
      unmatched.lines
        .flatMap((line) => line.tokens)
        .some((token) => token.step),
    ).toBe(false);
  });
});
