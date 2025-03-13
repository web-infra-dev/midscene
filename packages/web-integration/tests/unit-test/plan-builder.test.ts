import { buildAndRunPlan } from '@/common/plan-builder';
import { beforeEach, describe, expect, it } from 'vitest';

describe('build plans', () => {
  it('tap', async () => {
    const result = buildAndRunPlan(
      'Tap',
      {
        prompt: 'OK button',
      },
      null,
    );
    expect(result).toMatchSnapshot();
  });

  it('hover', async () => {
    const result = await buildAndRunPlan(
      'Hover',
      {
        prompt: 'OK button',
      },
      null,
    );
    expect(result).toMatchSnapshot();
  });
});
