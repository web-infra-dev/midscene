import { parseActionParam } from '@/ai-model';
import { actionScrollParamSchema, defineActionScroll } from '@/device';
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

describe('touch Scroll targeting contract', () => {
  it('keeps wheel scrolling compatible and makes touch origins explicit', () => {
    const wheel = defineActionScroll(async () => {});
    const touch = defineActionScroll(async () => {}, 'touch');
    expect(wheel.paramSchema).toBe(actionScrollParamSchema);
    const schema = touch.paramSchema as typeof actionScrollParamSchema;
    expect(schema.shape.locate.description).toContain('safe touch origin');
    expect(schema.shape.locate.description).toContain('collapse the picker');
    expect(schema.parse({ direction: 'down', distance: 100 })).toMatchObject({
      direction: 'down',
      distance: 100,
    });
  });
});
