import { buildPlans } from '@/common/plan-builder';
import { describe, expect, it } from 'vitest';

describe('build plans', () => {
  it('tap', async () => {
    const result = buildPlans(
      'Tap',
      {
        prompt: 'OK button',
      },
      undefined,
    );
    expect(result).toMatchSnapshot();
  });

  it('rightClick', async () => {
    const result = buildPlans(
      'RightClick',
      {
        prompt: 'context menu target',
      },
      undefined,
    );
    expect(result).toMatchSnapshot();
  });

  it('hover', async () => {
    const result = await buildPlans(
      'Hover',
      {
        prompt: 'OK button',
      },
      undefined,
    );
    expect(result).toMatchSnapshot();
  });

  it('input', async () => {
    const result = await buildPlans(
      'Input',
      { prompt: 'OK button' },
      { value: 'OK' },
    );
    expect(result).toMatchSnapshot();
  });

  it('keyboardPress', async () => {
    const result = await buildPlans('KeyboardPress', undefined, {
      value: 'OK',
    });
    expect(result).toMatchSnapshot();
  });

  it('scroll', async () => {
    const result = await buildPlans('Scroll', undefined, {
      direction: 'down',
      scrollType: 'once',
      distance: 100,
    });
    expect(result).toMatchSnapshot();
  });

  it('scroll with locate', async () => {
    const result = await buildPlans(
      'Scroll',
      {
        prompt: 'OK button',
      },
      {
        direction: 'right',
        scrollType: 'untilRight',
      },
    );
    expect(result).toMatchSnapshot();
  });

  it('sleep', async () => {
    const result = await buildPlans('Sleep', undefined, {
      timeMs: 1000,
    });
    expect(result).toMatchSnapshot();
  });
});
