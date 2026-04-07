import { formatModelBriefText } from '@/utils/model-brief';
import type { ModelBrief } from '@midscene/core';
import { describe, expect, it } from 'vitest';

describe('formatModelBriefText', () => {
  it('hides intent when all semantic intents resolve to the same model', () => {
    const modelBriefs: ModelBrief[] = [
      {
        intent: 'default',
        name: 'gpt-4o',
        modelDescription: 'shared model',
      },
      {
        intent: 'planning',
        name: 'gpt-4o',
        modelDescription: 'shared model',
      },
      {
        intent: 'insight',
        name: 'gpt-4o',
        modelDescription: 'shared model',
      },
    ];

    expect(formatModelBriefText(modelBriefs)).toBe('gpt-4o(shared model)');
  });

  it('still hides intent when descriptions differ but model names are the same', () => {
    const modelBriefs: ModelBrief[] = [
      {
        intent: 'default',
        name: 'gpt-4o',
        modelDescription: 'default lane',
      },
      {
        intent: 'planning',
        name: 'gpt-4o',
        modelDescription: 'planner lane',
      },
    ];

    expect(formatModelBriefText(modelBriefs)).toBe('gpt-4o(default lane)');
  });

  it('shows intent when multiple different models are used together', () => {
    const modelBriefs: ModelBrief[] = [
      {
        intent: 'default',
        name: 'gpt-4o',
        modelDescription: 'shared model',
      },
      {
        intent: 'planning',
        name: 'o3',
        modelDescription: 'planner',
      },
      {
        intent: 'insight',
        name: 'gpt-4o',
        modelDescription: 'shared model',
      },
    ];

    expect(formatModelBriefText(modelBriefs)).toBe(
      'default/gpt-4o(shared model), planning/o3(planner), insight/gpt-4o(shared model)',
    );
  });
});
