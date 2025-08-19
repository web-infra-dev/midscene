import { systemPromptToLocateElement } from '@/ai-model';
import {
  automationUserPrompt,
  descriptionForAction,
  generateTaskBackgroundContext,
  planSchema,
  systemPromptToTaskPlanning,
} from '@/ai-model/prompt/llm-planning';
import { systemPromptToLocateSection } from '@/ai-model/prompt/llm-section-locator';
import { getUiTarsPlanningPrompt } from '@/ai-model/prompt/ui-tars-planning';
import { MidsceneLocation } from '@/index';
import { mockActionSpace } from 'tests/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  extractDataQueryPrompt,
  systemPromptToExtract,
} from '../../../src/ai-model/prompt/extraction';
import { mockNonChinaTimeZone, restoreIntl } from '../mocks/intl-mock';

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
          locate: MidsceneLocation.describe('The element to be tapped'),
          locate2: MidsceneLocation.describe(
            'The element to be tapped for the second time',
          ).optional(),
          scrollType: z
            .enum([
              'once',
              'untilBottom',
              'untilTop',
              'untilRight',
              'untilLeft',
            ])
            .describe('The scroll type'),
          actionType: z
            .enum(['Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert'])
            .describe('The scroll type')
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
          - value3?: number // The value 3
          - locate: {"bbox": [number, number, number, number], "prompt": string} // The element to be tapped
          - locate2?: {"bbox": [number, number, number, number], "prompt": string} // The element to be tapped for the second time
          - scrollType: enum('once', 'untilBottom', 'untilTop', 'untilRight', 'untilLeft') // The scroll type
          - actionType?: enum('Tap', 'DragAndDrop', 'Scroll', 'Input', 'Assert') // The scroll type
          - option?: number // An optional option value"
    `);
  });
});

describe('system prompts', () => {
  it('planning - 4o', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      vlMode: false,
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - 4o - response format', () => {
    const schema = planSchema;
    expect(schema).toMatchSnapshot();
  });

  it('planning - qwen', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      vlMode: 'qwen-vl',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - gemini', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      vlMode: 'gemini',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - android', async () => {
    const prompt = await systemPromptToTaskPlanning({
      actionSpace: mockActionSpace,
      vlMode: 'qwen-vl',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('planning - background context', () => {
    const context = generateTaskBackgroundContext(
      'THIS IS USER INSTRUCTION',
      'THIS IS WHAT HAS BEEN DONE',
      'THIS IS BACKGROUND PROMPT',
    );
    expect(context).toMatchSnapshot();
  });

  it('planning - user prompt - 4o', async () => {
    const prompt = automationUserPrompt(false);
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
      userActionContext: 'THIS IS BACKGROUND PROMPT',
    });
    expect(result).toMatchSnapshot();
  });

  it('planning - user prompt - qwen', async () => {
    const prompt = automationUserPrompt('qwen-vl');
    const result = await prompt.format({
      pageDescription: 'THIS IS PAGE DESCRIPTION',
      taskBackgroundContext: 'THIS IS BACKGROUND CONTEXT',
    });
    expect(result).toMatchSnapshot();
  });

  it('section locator - gemini', () => {
    const prompt = systemPromptToLocateSection('gemini');
    expect(prompt).toMatchSnapshot();
  });

  it('section locator - qwen', () => {
    const prompt = systemPromptToLocateSection('qwen-vl');
    expect(prompt).toMatchSnapshot();
  });

  it('locator - 4o', () => {
    const prompt = systemPromptToLocateElement(false);
    expect(prompt).toMatchSnapshot();
  });

  it('locator - qwen', () => {
    const prompt = systemPromptToLocateElement('qwen-vl');
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

  it('extract element by extractDataPrompt', async () => {
    const prompt = await extractDataQueryPrompt(
      'todo title, string',
      'todo title, string',
    );
    expect(prompt).toMatchSnapshot();
  });

  it('extract element by extractDataPrompt - object', async () => {
    const prompt = await extractDataQueryPrompt('todo title, string', {
      foo: 'an array indicates the foo',
    });
    expect(prompt).toMatchSnapshot();
  });
});
