import { describe, expect, it } from 'vitest';
import { isMac, transformHotkeyInput } from '../../src/us-keyboard-layout';

describe('transformHotkeyInput', () => {
  it('should transform single key input', () => {
    expect(transformHotkeyInput('a')).toEqual(['A']);
    expect(transformHotkeyInput('A')).toEqual(['A']);
    expect(transformHotkeyInput('1')).toEqual(['1']);
  });

  it('should transform key combinations with +', () => {
    if (isMac) {
      expect(transformHotkeyInput('ctrl a')).toEqual(['Meta', 'A']);
    } else {
      expect(transformHotkeyInput('ctrl a')).toEqual(['Control', 'A']);
    }
    expect(transformHotkeyInput('Shift A')).toEqual(['Shift', 'A']);
    expect(transformHotkeyInput('Alt 1')).toEqual(['Alt', '1']);
  });

  it('should transform key combinations with multiple modifiers', () => {
    if (isMac) {
      expect(transformHotkeyInput('Ctrl Shift a')).toEqual([
        'Meta',
        'Shift',
        'A',
      ]);
      expect(transformHotkeyInput('Ctrl alt delete')).toEqual([
        'Meta',
        'Alt',
        'Delete',
      ]);
    } else {
      expect(transformHotkeyInput('Ctrl Shift a')).toEqual([
        'Control',
        'Shift',
        'A',
      ]);
    }
    expect(transformHotkeyInput('Shift alt 1')).toEqual(['Shift', 'Alt', '1']);
  });

  it('should handle special key names', () => {
    expect(transformHotkeyInput('Enter')).toEqual(['Enter']);
    expect(transformHotkeyInput('Space')).toEqual([' ']);
    expect(transformHotkeyInput('PageDown')).toEqual(['PageDown']);
  });

  it('should handle combinations with special keys', () => {
    if (isMac) {
      expect(transformHotkeyInput('Ctrl Enter')).toEqual(['Meta', 'Enter']);
    } else {
      expect(transformHotkeyInput('Ctrl Enter')).toEqual(['Control', 'Enter']);
    }
    expect(transformHotkeyInput('Shift Space')).toEqual(['Shift', ' ']);
    expect(transformHotkeyInput('Alt PageDown')).toEqual(['Alt', 'PageDown']);
  });

  it('should handle empty input', () => {
    expect(transformHotkeyInput('')).toEqual(['']);
  });
});
