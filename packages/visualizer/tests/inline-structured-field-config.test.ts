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

function makeLocateField() {
  return {
    _def: {
      typeName: 'ZodObject',
      shape: { midscene_location_field_flag: {} },
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

  test('synthesises "Enter <name>" placeholder for a string field without description', () => {
    const actionSpace = [
      {
        name: 'aiQuery',
        interfaceAlias: 'aiQuery',
        paramSchema: {
          shape: {
            query: makeStringField(),
          },
        },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiQuery')).toEqual({
      name: 'query',
      placeholder: 'Enter query',
    });
  });

  test('returns locate-specific placeholder for a single locate field', () => {
    const actionSpace = [
      {
        name: 'aiTap',
        interfaceAlias: 'aiTap',
        paramSchema: {
          shape: {
            locate: makeLocateField(),
          },
        },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiTap')).toEqual({
      name: 'locate',
      placeholder: 'Describe the element you want to interact with',
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

  test('returns null when paramSchema is not a Zod object', () => {
    const actionSpace = [
      {
        name: 'aiRaw',
        interfaceAlias: 'aiRaw',
        paramSchema: 'not-a-zod-schema',
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiRaw')).toBeNull();
  });

  test('returns null when selectedType is not present in the action space', () => {
    const actionSpace = [
      {
        name: 'aiTap',
        interfaceAlias: 'aiTap',
        paramSchema: { shape: { locate: makeLocateField() } },
      },
    ] as any;

    expect(getInlineStructuredFieldConfig(actionSpace, 'aiUnknown')).toBeNull();
  });

  test('returns null when actionSpace is empty or selectedType is blank', () => {
    expect(getInlineStructuredFieldConfig([], 'aiAct')).toBeNull();
    expect(getInlineStructuredFieldConfig(undefined, 'aiAct')).toBeNull();
    expect(
      getInlineStructuredFieldConfig(
        [
          {
            name: 'aiAct',
            paramSchema: { shape: { prompt: makeStringField() } },
          },
        ] as any,
        '',
      ),
    ).toBeNull();
  });
});

describe('getAvailablePromptActionTypes', () => {
  test('includes aiAct when actionSpace exposes it', () => {
    const actionSpace = [
      { name: 'aiAct', interfaceAlias: 'aiAct' },
      { name: 'Tap', interfaceAlias: 'aiTap' },
    ] as any;

    const actions = getAvailablePromptActionTypes(actionSpace);

    expect(actions).toContain('aiAct');
    expect(actions).toContain('aiTap');
  });

  test('omits aiAct when actionSpace does not expose it', () => {
    const actionSpace = [
      { name: 'Tap', interfaceAlias: 'aiTap' },
      { name: 'Swipe', interfaceAlias: 'aiSwipe' },
    ] as any;

    const actions = getAvailablePromptActionTypes(actionSpace);

    expect(actions).not.toContain('aiAct');
    expect(actions).toContain('aiTap');
    expect(actions).toContain('aiSwipe');
  });

  test('falls back to metadata methods when actionSpace is missing', () => {
    const actions = getAvailablePromptActionTypes(undefined);
    expect(actions.length).toBeGreaterThan(0);
  });
});
