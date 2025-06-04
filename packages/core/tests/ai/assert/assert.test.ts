import { AiAssert } from '@/ai-model';
import { getContextFromFixture } from 'tests/evaluation';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('assert', () => {
  it('todo pass', async () => {
    const { context } = await getContextFromFixture('todo');

    const {
      content: { pass },
    } = await AiAssert({
      assertion: 'Three tasks have been added',
      context,
    });
    expect(pass).toBe(true);
  });

  it('todo error', async () => {
    const { context } = await getContextFromFixture('todo');

    const {
      content: { pass, thought },
    } = await AiAssert({
      assertion: 'There are four tasks in the task list',
      context,
    });
    expect(pass).toBe(false);
  });

  it('todo deep think', async () => {
    const { context } = await getContextFromFixture('todo');

    const {
      content: { pass, thought },
    } = await AiAssert({
      assertion: 'Three tasks have been added',
      context,
      deepThink: false,
    });
    const {
      content: { pass: passWithDeepThink, thought: thoughtWithDeepThink },
    } = await AiAssert({
      assertion: 'Three tasks have been added',
      context,
      deepThink: true,
    });
    expect(pass).toBe(false);
    expect(passWithDeepThink).toBe(true);
    expect(thoughtWithDeepThink.length).toBeGreaterThan(thought.length);
  });
});
