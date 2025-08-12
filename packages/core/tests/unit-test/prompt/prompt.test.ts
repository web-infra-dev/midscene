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
import { mockActionSpace } from 'tests/common';
import { describe, expect, it } from 'vitest';
import {
  extractDataQueryPrompt,
  systemPromptToExtract,
} from '../../../src/ai-model/prompt/extraction';
import { mockNonChinaTimeZone, restoreIntl } from '../mocks/intl-mock';

const mockLocatorScheme = 'locate: {"mock": string}';
describe('action space', () => {
  it('action without param, location is false', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        location: false,
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap""
    `);
  });

  it('action with param, location is false', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: '{ foo: string }',
        paramDescription: 'The foo to be tapped',
        location: false,
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - param: { foo: string } // The foo to be tapped"
    `);
  });

  it('action with param, no paramDescription, location is false', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: '{ foo: string }',
        location: false,
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - param: { foo: string }"
    `);
  });

  it('action without param, location is required', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        location: 'required',
        whatToLocate: 'The element to be tapped',
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - locate: {"mock": string}"
    `);
  });

  it('action with param, location is optional', () => {
    const action = descriptionForAction(
      {
        name: 'Tap',
        description: 'Tap the element',
        paramSchema: '{ value: string }',
        paramDescription: 'The value to be tapped',
        location: 'optional',
        call: async () => {},
      },
      mockLocatorScheme,
    );
    expect(action).toMatchInlineSnapshot(`
      "- Tap, Tap the element
        - type: "Tap"
        - param: { value: string } // The value to be tapped
        - locate: {"mock": string} | null"
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
