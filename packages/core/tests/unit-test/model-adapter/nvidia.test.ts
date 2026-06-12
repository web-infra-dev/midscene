import { nvidiaAdapters } from '@/ai-model/models/nvidia';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const nvidiaAdapter = new ResolvedModelAdapter(
  nvidiaAdapters.nvidia,
  'nvidia',
);

describe('nvidia model adapter', () => {
  it('uses default OpenAI-compatible chat completion behavior', () => {
    expect(nvidiaAdapter.chatCompletion.unsupportedUserConfig).toEqual([]);
    expect(nvidiaAdapter.chatCompletion.buildChatCompletionParams({})).toEqual({
      config: { temperature: 0 },
    });
    expect(
      nvidiaAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0.7 },
      }),
    ).toEqual({
      config: { temperature: 0.7 },
    });
    expect(nvidiaAdapter.chatCompletion.resolveImageDetail({})).toBeUndefined();
    expect(nvidiaAdapter.imagePreprocess).toEqual({});
  });

  it('uses standard planning and locate policies', () => {
    expect(nvidiaAdapter.planning).toMatchObject({
      kind: 'standard',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: true,
    });
    expect(nvidiaAdapter.locate.kind).toBe('standard');
    if (nvidiaAdapter.locate.kind !== 'standard') {
      throw new Error('nvidia should use standard locate adapter');
    }
    expect(nvidiaAdapter.locate.supportsSearchArea).toBe(true);
  });

  it('parses nvidia ref/box locate response and maps normalized bbox', () => {
    expect(
      nvidiaAdapter.jsonParser(
        '<ref>加</ref><box><280><122><302><156></box>',
        {
          source: 'locate',
        },
      ),
    ).toEqual({
      ref: '加',
      bbox: [280, 122, 302, 156],
    });

    const locateAdapter = nvidiaAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('nvidia should use standard locate adapter');
    }

    expect(
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        { bbox: [280, 122, 302, 156] },
        { preparedSize: { width: 1280, height: 720 } },
      ),
    ).toEqual([358, 88, 386, 112]);
  });

  it('keeps normal JSON response parsing for nvidia', () => {
    expect(nvidiaAdapter.jsonParser('{"bbox":[100,200,300,400]}')).toEqual({
      bbox: [100, 200, 300, 400],
    });
  });
});
