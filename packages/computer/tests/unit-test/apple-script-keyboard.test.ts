import { describe, expect, it } from '@rstest/core';
import { buildAppleScriptKeyPress } from '../../src/apple-script-keyboard';

describe('AppleScript keyboard event modes', () => {
  it('keeps compact logical events as the default', () => {
    expect(buildAppleScriptKeyPress('s', ['control'])).toBe(
      'tell application "System Events" to keystroke "s" using {control down}',
    );
    expect(buildAppleScriptKeyPress('K')).toBe(
      'tell application "System Events" to keystroke "K"',
    );
  });

  it.each([
    ['K', 'k'],
    ['#', '3'],
  ])('decomposes physical %s into Shift plus %s', (key, baseKey) => {
    expect(buildAppleScriptKeyPress(key, [], 'physical')).toBe(
      [
        'tell application "System Events"',
        'try',
        'key down shift',
        `keystroke "${baseKey}"`,
        'on error errorMessage number errorNumber',
        'key up shift',
        'error errorMessage number errorNumber',
        'end try',
        'key up shift',
        'end tell',
      ].join('\n'),
    );
  });

  it('deduplicates aliases and releases multiple modifiers in reverse order', () => {
    expect(
      buildAppleScriptKeyPress(
        'K',
        ['meta', 'alt', 'command', 'shift'],
        'physical',
      ),
    ).toBe(
      [
        'tell application "System Events"',
        'try',
        'key down command',
        'key down option',
        'key down shift',
        'keystroke "k"',
        'on error errorMessage number errorNumber',
        'key up shift',
        'key up option',
        'key up command',
        'error errorMessage number errorNumber',
        'end try',
        'key up shift',
        'key up option',
        'key up command',
        'end tell',
      ].join('\n'),
    );
  });

  it('uses AppleScript key codes for modified special keys', () => {
    const script = buildAppleScriptKeyPress('Enter', ['ctrl'], 'physical');

    expect(script).toContain('key down control\nkey code 36');
    expect(script).not.toContain('keystroke "Enter"');
  });
});
