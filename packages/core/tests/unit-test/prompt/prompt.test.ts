import { systemPromptToLocateElement } from '@/ai-model';
import {
  descriptionForAction,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { getUiTarsPlanningPrompt } from '@/ai-model/prompt/ui-tars-planning';
import { getMidsceneLocationSchema } from '@/index';
import { mockActionSpace } from 'tests/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  extractDataQueryPrompt,
  systemPromptToExtract,
} from '../../../src/ai-model/prompt/extraction';
import { mockNonChinaTimeZone, restoreIntl } from '../mocks/intl-mock';

// Mock getPreferredLanguage to ensure consistent test output
vi.mock('@midscene/shared/env', () => ({
  getPreferredLanguage: vi.fn().mockReturnValue('English'),
}));

const mockLocatorScheme =
  '{"bbox": [number, number, number, number], "prompt": string}';
describe('action space', () => {
  it('action without param, no locate needed', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap""
    `);
  });

  it('action with param, no locate needed', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: z.object({
          foo: z.string().describe('The foo to be tapped'),
          bar: z.number().optional().describe('An optional bar value'),
          help: z.string().describe('Help information for this action'),
        }),
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - param:
          - foo: string // The foo to be tapped
          - bar?: number // An optional bar value
          - help: string // Help information for this action"
    `);
  });

  it('action with param, multiple location fields', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: z.object({
          value: z.string().describe('The value to be tapped'),
          value2: z.number().describe('The value to be tapped').optional(),
          value3: z.number().describe('The value 3').optional().default(345),
          locate: getMidsceneLocationSchema().describe(
            'The element to be tapped',
          ),
          locate2: getMidsceneLocationSchema()
            .describe('The element to be tapped for the second time')
            .optional(),
          scrollType: z
            .enum([
              'once',
              'untilBottom',
              'untilTop',
              'untilRight',
              'untilLeft',
            ])
            .default('once')
            .describe('The scroll type'),
          actionType: z
            .enum(['Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert'])
            .describe('The scroll type')
            .default('Tap')
            .optional(),
          option: z.number().optional().describe('An optional option value'),
        }),
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - param:
          - value: string // The value to be tapped
          - value2?: number // The value to be tapped
          - value3?: number // The value 3, default: 345
          - locate: {"bbox": [number, number, number, number], "prompt": string} // The element to be tapped
          - locate2?: {"bbox": [number, number, number, number], "prompt": string} // The element to be tapped for the second time
          - scrollType?: enum('once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft') // The scroll type, default: "once"
          - actionType?: enum('Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert') // The scroll type, default: "Tap"
          - option?: number // An optional option value"
    `);
  });
});

describe('system prompts', () => {
  it('planning - cot', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      modelFamily: undefined,
      includeBbox: false,
    });
    expect(prompt).toMatchSnapshot();
  });

  // it('planning - includeThought false removes thought field', async () => {
  //   const prompt = await systemPromptToTaskPlanning({
  //     actionSpace: mockActionSpace,
  //     modelFamily: undefined,
  //     includeBbox: false,
  //     includeThought: false,
  //   });

  //   expect(prompt).not.toContain('"thought"');
  //   expect(prompt).toContain('"log"');
  // });

  it('planning - should throw error when includeBbox is true but modelFamily is undefined', async () => {
    await expect(
      systemPromptToTaskPlanning({
        actionSpace: mockActionSpace,
        modelFamily: undefined,
        includeBbox: true,
      }),
    ).rejects.toThrow(
      'modelFamily cannot be undefined when includeBbox is true. A valid modelFamily is required for bbox-based location.',
    );
  });

  it('planning - qwen - cot', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      modelFamily: 'qwen2.5-vl',
      includeBbox: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - qwen - cot without bbox', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      modelFamily: 'qwen2.5-vl',
      includeBbox: false,
    });

    expect(prompt).toMatchSnapshot();
  });

  it('planning - gemini', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      modelFamily: 'gemini',
      includeBbox: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - android', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      modelFamily: 'qwen2.5-vl',
      includeBbox: true,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - gemini', () => {
    const prompt = systemPromptToLocateSection('gemini');
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - qwen', () => {
    const prompt = systemPromptToLocateSection('qwen2.5-vl');
    expect(prompt).toMatchSnapshot();
  });

  it('locator - 4o', () => {
    const prompt = systemPromptToLocateElement(undefined);
    expect(prompt).toMatchSnapshot();
  });

  it('locator - qwen', () => {
    const prompt = systemPromptToLocateElement('qwen2.5-vl');
    expect(prompt).toMatchSnapshot();
  });

  it('locator - gemini', () => {
    const prompt = systemPromptToLocateElement('gemini');
    expect(prompt).toMatchSnapshot();
  });

  it('ui-tars planning', () => {
    // Mock Intl to ensure non-China timezone
    mockNonChinaTimeZone();

    const prompt = getUiTarsPlanningPrompt();
    expect(prompt).toMatchSnapshot();

    // Restore original Intl
    restoreIntl();
  });
});

describe('extract element', () => {
  it('systemPromptToExtract', () => {
    const prompt = systemPromptToExtract();
    expect(prompt).toMatchSnapshot();
  });

  it('extract element by extractDataPrompt', () => {
    const prompt = extractDataQueryPrompt(
      'todo title, string',
      'todo title, string',
    );
    expect(prompt).toMatchSnapshot();
  });

  it('extract element by extractDataPrompt - object', () => {
    const prompt = extractDataQueryPrompt('todo title, string', {
      foo: 'an array indicates the foo',
    });
    expect(prompt).toMatchSnapshot();
  });
});
