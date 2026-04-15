import { describe, expect, test } from 'vitest';
import {
  getAvailablePromptActionTypes,
  getInlineStructuredFieldConfig,
} from '../src/utils/prompt-input-utils';

function makeStringField(description?: string) {
  return {
    _def: {
      typeName: 'ZodString',
      ...(description ? { description } : {}),
    },
  };
}

function makeNumberField() {
  return {
    _def: {
      typeName: 'ZodNumber',
    },
  };
}

describe('getInlineStructuredFieldConfig', () => {
  test('returns inline config for a single string field', () => {
    const actionSpace = [
      {
        name: 'aiAct',
        interfaceAlias: 'aiAct',
        paramSchema: {
          shape: {
            prompt: makeStringField('Tell the agent what to do'),
          },
        },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiAct')).toEqual({
      name: 'prompt',
      placeholder: 'Tell the agent what to do',
    });
  });

  test('returns null for multi-field schemas', () => {
    const actionSpace = [
      {
        name: 'aiInput',
        interfaceAlias: 'aiInput',
        paramSchema: {
          shape: {
            value: makeStringField(),
            locate: makeStringField(),
          },
        },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiInput')).toBeNull();
  });

  test('returns null for single non-text field schemas', () => {
    const actionSpace = [
      {
        name: 'aiNumber',
        interfaceAlias: 'aiNumber',
        paramSchema: {
          shape: {
            count: makeNumberField(),
          },
        },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiNumber')).toBeNull();
  });
});

describe('getAvailablePromptActionTypes', () => {
  test('always keeps aiAct in the action menu', () => {
    const actionSpace = [
      {
        name: 'Swipe',
        interfaceAlias: 'aiSwipe',
      },
      {
        name: 'Tap',
        interfaceAlias: 'aiTap',
      },
    ] as any;

    const actions = getAvailablePromptActionTypes(actionSpace);

    expect(actions).toContain('aiAct');
    expect(actions).toContain('aiTap');
    expect(actions).toContain('aiSwipe');
  });
});
