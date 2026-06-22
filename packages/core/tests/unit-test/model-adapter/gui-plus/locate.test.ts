import { createGuiPlus20260226PlanningTapLocator } from '@/ai-model/models/gui-plus/locate';
import { describe, expect, it } from 'vitest';

describe('GUI-Plus planning tap locator definition', () => {
  it('uses a locate-only computer_use prompt', () => {
    const prompt = createGuiPlus20260226PlanningTapLocator().buildSystemPrompt();

    expect(prompt).toContain('Your only goal is to click the UI element');
    expect(prompt).toContain('"left_click"');
    expect(prompt).toContain('"enum": ["left_click", "terminate"]');
    expect(prompt).not.toContain('`type`');
    expect(prompt).not.toContain('`scroll`');
  });

  it('extracts the located pixel bbox from the first Tap action only', () => {
    const locator = createGuiPlus20260226PlanningTapLocator();

    expect(
      locator.getLocatedPixelBbox([
        { type: 'Input', param: { value: 'world' } },
        {
          type: 'Tap',
          param: {
            locate: {
              locatedPixelBbox: [10, 20, 30, 40],
            },
          },
        },
      ] as any),
    ).toEqual([10, 20, 30, 40]);
    expect(
      locator.getLocatedPixelBbox([{ type: 'Input', param: {} }] as any),
    ).toBeUndefined();
  });
});
