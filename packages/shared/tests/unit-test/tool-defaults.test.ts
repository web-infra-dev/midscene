import {
  TOOL_BEHAVIOR_FLAGS,
  mergeToolDefaults,
  resolveToolDefaults,
  stripBehaviorFlags,
} from '@/mcp/tool-defaults';
import { describe, expect, it } from 'vitest';

describe('mergeToolDefaults', () => {
  it('merges locate and act bags with b winning', () => {
    expect(
      mergeToolDefaults(
        { locate: { deepLocate: true }, act: { deepThink: true } },
        { locate: { deepLocate: false }, act: { deepLocate: true } },
      ),
    ).toEqual({
      locate: { deepLocate: false },
      act: { deepThink: true, deepLocate: true },
    });
  });

  it('omits empty bags', () => {
    expect(mergeToolDefaults({}, {})).toEqual({});
    expect(mergeToolDefaults({ act: { deepThink: true } }, {})).toEqual({
      act: { deepThink: true },
    });
  });
});

describe('resolveToolDefaults', () => {
  it('returns empty defaults when nothing is enabled', () => {
    expect(resolveToolDefaults(() => false)).toEqual({});
  });

  it('resolves a single flag from the registry', () => {
    expect(resolveToolDefaults((cli) => cli === 'deep-locate')).toEqual({
      locate: { deepLocate: true },
      act: { deepLocate: true },
    });
  });

  it('merges every enabled flag', () => {
    expect(resolveToolDefaults(() => true)).toEqual({
      locate: { deepLocate: true },
      act: { deepLocate: true, deepThink: true },
    });
  });
});

describe('stripBehaviorFlags', () => {
  it('returns empty defaults and untouched args when no flag is present', () => {
    expect(stripBehaviorFlags(['tap', '--locate', 'btn'])).toEqual({
      rawArgs: ['tap', '--locate', 'btn'],
      toolDefaults: {},
    });
  });

  it('strips a leading behavior flag and resolves its defaults', () => {
    expect(
      stripBehaviorFlags(['--deep-locate', 'tap', '--locate', 'btn']),
    ).toEqual({
      rawArgs: ['tap', '--locate', 'btn'],
      toolDefaults: { locate: { deepLocate: true }, act: { deepLocate: true } },
    });
  });

  it('strips a behavior flag that follows the command, preserving order', () => {
    expect(
      stripBehaviorFlags(['tap', '--deep-locate', '--locate', 'btn']),
    ).toEqual({
      rawArgs: ['tap', '--locate', 'btn'],
      toolDefaults: { locate: { deepLocate: true }, act: { deepLocate: true } },
    });
  });

  it('merges defaults when several behavior flags are present', () => {
    expect(
      stripBehaviorFlags([
        'act',
        '--deep-locate',
        '--deep-think',
        '--prompt',
        'go',
      ]),
    ).toEqual({
      rawArgs: ['act', '--prompt', 'go'],
      toolDefaults: {
        locate: { deepLocate: true },
        act: { deepLocate: true, deepThink: true },
      },
    });
  });

  it('only recognizes exact kebab-case flags (not camelCase or value forms)', () => {
    const camel = stripBehaviorFlags(['--deepLocate', 'tap']);
    expect(camel.toolDefaults).toEqual({});
    expect(camel.rawArgs).toEqual(['--deepLocate', 'tap']);

    const valued = stripBehaviorFlags(['--deep-locate=true', 'tap']);
    expect(valued.toolDefaults).toEqual({});
    expect(valued.rawArgs).toEqual(['--deep-locate=true', 'tap']);
  });

  it('covers every registered flag', () => {
    for (const flag of TOOL_BEHAVIOR_FLAGS) {
      const { rawArgs, toolDefaults } = stripBehaviorFlags([
        `--${flag.cli}`,
        'cmd',
      ]);
      expect(rawArgs).toEqual(['cmd']);
      expect(toolDefaults).toEqual(flag.defaults);
    }
  });
});
