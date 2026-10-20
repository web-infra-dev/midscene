import { AiLocateElement } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { globalModelConfigManager } from '@midscene/shared/env';
import { expect, test } from '@rstest/core';
import { getContextFromFixture } from '../evaluation';

test.skipIf(process.env.MIDSCENE_MODEL_FAMILY !== 'gemma')(
  'grounds todo controls with Gemma using normalized xy bounding boxes',
  { timeout: 180 * 1000 },
  async () => {
    const { context } = await getContextFromFixture('todo');
    const modelRuntime = getModelRuntime(
      globalModelConfigManager.getModelConfig('default'),
    );
    const locate = modelRuntime.adapter.locate;
    if (locate.kind !== 'standard') {
      throw new Error('Gemma should use the standard locate adapter');
    }

    const targets = [
      {
        description:
          'the input field with placeholder "What needs to be done?"',
        bounds: [514, 129, 1066, 197],
      },
      {
        description: 'the empty checkbox to the left of "Learn Rust"',
        bounds: [522, 270, 553, 301],
      },
      {
        description:
          'the Quick Start link under Official Resources on the left',
        bounds: [42, 462, 116, 481],
      },
    ];

    for (const { description, bounds } of targets) {
      const result = await AiLocateElement({
        context,
        targetElementDescription: description,
        modelRuntime,
      });
      const parsed = locate.element.protocol.parseRawResponse(
        result.rawResponse,
        locate.element.resultCodec.promptSpec,
      );
      expect(parsed.kind).toBe('located');
      if (parsed.kind !== 'located' || !Array.isArray(parsed.target)) {
        throw new Error(`Gemma did not return coordinates for ${description}`);
      }
      expect(parsed.target).toHaveLength(4);
      for (const coordinate of parsed.target) {
        expect(Number.isFinite(coordinate)).toBe(true);
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThanOrEqual(1000);
      }

      expect(result.parseResult.errors).toEqual([]);
      const element = result.parseResult.element;
      if (!element) {
        throw new Error(`Gemma did not locate ${description}`);
      }
      expect(element.center[0]).toBeGreaterThanOrEqual(bounds[0]);
      expect(element.center[0]).toBeLessThanOrEqual(bounds[2]);
      expect(element.center[1]).toBeGreaterThanOrEqual(bounds[1]);
      expect(element.center[1]).toBeLessThanOrEqual(bounds[3]);
    }
  },
);
