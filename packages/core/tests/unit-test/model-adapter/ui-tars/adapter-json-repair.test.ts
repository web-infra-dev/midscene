import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/json', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller/json')>();
  return {
    ...actual,
    extractJSONFromCodeBlock: vi.fn((raw: string) => raw),
    safeParseJson: vi.fn(() => {
      throw new Error('first safe parse failed');
    }),
  };
});

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

describe('ui-tars json repair fallback', () => {
  it('repairs bbox whitespace after the first parser fails', () => {
    expect(
      uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}', {
        source: 'locate',
      }),
    ).toEqual({
      bbox: [123, 456, 789, 100],
    });
  });

  it('rethrows the first parse error for generic parser sources', () => {
    expect(() =>
      uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}'),
    ).toThrow('first safe parse failed');
  });
});
