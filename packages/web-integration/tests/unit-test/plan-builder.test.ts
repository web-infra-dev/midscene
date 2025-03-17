import { buildPlans } from '@/common/plan-builder';
import { beforeEach, describe, expect, it } from 'vitest';

describe('build plans', () => {
  it('tap', async () => {
    const result = buildPlans(
      'Tap',
      {
        prompt: 'OK button',
      },
      null,
    );
    expect(result).toMatchSnapshot();
  });

  it('hover', async () => {
    const result = await buildPlans(
      'Hover',
      {
        prompt: 'OK button',
        searchArea: 'the cookie prompt',
      },
      null,
    );
    expect(result).toMatchSnapshot();
  });
});
