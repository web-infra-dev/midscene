import { describe, expect, it } from '@rstest/core';
import { buildAppleScriptKeyPress } from '../../src/apple-script-keyboard';

describe('AppleScript keyboard events', () => {
  it('builds compact logical events', () => {
    expect(buildAppleScriptKeyPress('s', ['control'])).toBe(
      'tell application "System Events" to keystroke "s" using {control down}',
    );
    expect(buildAppleScriptKeyPress('K')).toBe(
      'tell application "System Events" to keystroke "K"',
    );
  });

  it('uses AppleScript key codes for special keys', () => {
    expect(buildAppleScriptKeyPress('Enter', ['ctrl'])).toBe(
      'tell application "System Events" to key code 36 using {control down}',
    );
  });
});
