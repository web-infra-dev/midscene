import { parseActionParam } from '@/ai-model';
import { actionScrollParamSchema } from '@/device';
import { describe, expect, it } from '@rstest/core';

describe('Scroll Action Parameter Validation', () => {
  it('accepts a positive distance', () => {
    const parsed = parseActionParam(
      { direction: 'down', distance: 100 },
      actionScrollParamSchema,
    );

    expect(parsed).toMatchObject({
      direction: 'down',
      distance: 100,
      scrollType: 'singleAction',
    });
  });

  it('rejects a non-positive distance', () => {
    expect(() =>
      parseActionParam(
        { direction: 'down', distance: 0 },
        actionScrollParamSchema,
      ),
    ).toThrow();
    expect(() =>
      parseActionParam(
        { direction: 'down', distance: -100 },
        actionScrollParamSchema,
      ),
    ).toThrow();
  });

  it('keeps a null distance as the default-distance signal', () => {
    const parsed = parseActionParam(
      { direction: 'down', distance: null },
      actionScrollParamSchema,
    );

    expect(parsed).toMatchObject({
      direction: 'down',
      distance: null,
      scrollType: 'singleAction',
    });
  });
});
