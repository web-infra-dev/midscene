import { fillLocateParam } from '@/ai-model/llm-planning';
import { describe, expect, it } from 'vitest';

describe('llm planning', () => {
  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [100, 100, 200, 200] as [number, number, number, number],
    };

    const filledLocate = fillLocateParam(locate);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [100, 100, 200, 200],
    });
  });

  it('fill locate param', () => {
    const locate = {
      id: 'test',
      prompt: 'test',
      bbox_2d: [100, 100] as unknown as [number, number, number, number],
    };

    const filledLocate = fillLocateParam(locate);
    expect(filledLocate).toEqual({
      id: 'test',
      prompt: 'test',
      bbox: [100, 100, 120, 120],
    });
  });
});
