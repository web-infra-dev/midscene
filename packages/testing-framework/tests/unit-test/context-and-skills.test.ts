import { describe, expect, it } from 'vitest';
import { assembleContext } from '../../src/context/assembler';
import { OutputStoreImpl } from '../../src/engine/output-store';
import { extractSkillReferences } from '../../src/general-agent/skills';
import type { StepResult } from '../../src/types';

describe('extractSkillReferences', () => {
  it('extracts unique $name tokens', () => {
    expect(
      extractSkillReferences('Use $database and $logs, again $database'),
    ).toEqual(['database', 'logs']);
  });
  it('returns empty for no references', () => {
    expect(extractSkillReferences('just check the page')).toEqual([]);
  });
  it('supports hyphenated names', () => {
    expect(extractSkillReferences('use $order-db')).toEqual(['order-db']);
  });
});

describe('assembleContext', () => {
  const pastSteps: StepResult[] = [
    {
      index: 0,
      node: 'ui',
      input: 'Create an order',
      status: 'info',
      output: { text: 'Created order #123', structured: { orderId: '123' } },
      durationMs: 1,
    },
    {
      index: 1,
      node: 'verify',
      input: 'Order exists',
      status: 'passed',
      output: { text: 'ok' },
      verdict: { pass: true, reason: 'found in db' },
      durationMs: 1,
    },
  ];

  it('includes intents, outputs, and verdicts', () => {
    const ctx = assembleContext({
      caseName: 'Create Order',
      pastSteps,
      instruction: 'Use $database to verify orderId',
      kind: 'verify',
    });
    expect(ctx).toContain('Create Order');
    expect(ctx).toContain('Create an order');
    expect(ctx).toContain('Created order #123');
    expect(ctx).toContain('"orderId":"123"');
    expect(ctx).toContain('PASS — found in db');
    expect(ctx).toContain('report_verdict');
    expect(ctx).toContain('Use $database to verify orderId');
  });

  it('frames agent nodes as advisory', () => {
    const ctx = assembleContext({
      caseName: 'c',
      pastSteps: [],
      instruction: 'look around',
      kind: 'agent',
    });
    expect(ctx).toContain('advisory');
    expect(ctx).toContain('first step');
  });
});

describe('OutputStoreImpl', () => {
  it('tracks outputs in order and latest', () => {
    const store = new OutputStoreImpl();
    expect(store.latest()).toBeUndefined();
    store.add('ui', 0, { text: 'first' });
    store.add('verify', 1, { text: 'second' });
    expect(store.all()).toHaveLength(2);
    expect(store.latest()?.text).toBe('second');
  });
});
