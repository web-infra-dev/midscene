import { buildActionDescription } from '@/ai-model/model-adapter/default-planning-protocol';
import {
  findAllMidsceneLocatorField,
  getMidsceneLocationSchema,
} from '@/common';
import { describe, expect, it } from '@rstest/core';
import { z } from 'zod';

const locateFieldDescription =
  '{ prompt: string, bbox: [number, number, number, number] }';

describe('action description executable locator boundary', () => {
  const schema = z.object({ locate: getMidsceneLocationSchema() });

  it.each([
    ['plain', schema, true],
    ['refined', schema.refine(() => true), false],
    ['optional', schema.optional(), false],
    ['defaulted', schema.default({ locate: { prompt: 'submit' } }), false],
  ] as const)(
    'describes %s roots consistently with execution',
    (_, paramSchema, executable) => {
      const description = buildActionDescription({
        action: { name: 'CustomTap', paramSchema, call: async () => {} },
        locateFieldDescription,
      });

      expect(findAllMidsceneLocatorField(paramSchema)).toEqual(
        executable ? ['locate'] : [],
      );
      if (executable) {
        expect(description.param).toMatchObject({
          locate: { type: locateFieldDescription },
        });
      } else {
        expect(description.param).toMatchObject({
          locate: {
            type: 'object',
            properties: { prompt: { type: expect.stringContaining('string') } },
          },
        });
        expect(JSON.stringify(description.param)).not.toContain('bbox');
      }
    },
  );
});
