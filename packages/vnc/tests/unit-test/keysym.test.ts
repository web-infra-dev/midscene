import { describe, expect, it } from 'vitest';
import { keyToKeysym, modifierToKeysym, X11_KEYSYM } from '../../src/keysym';

describe('keysym', () => {
  describe('keyToKeysym', () => {
    it('should map special keys correctly', () => {
      expect(keyToKeysym('return')).toBe(0xff0d);
      expect(keyToKeysym('enter')).toBe(0xff0d);
      expect(keyToKeysym('tab')).toBe(0xff09);
      expect(keyToKeysym('escape')).toBe(0xff1b);
      expect(keyToKeysym('esc')).toBe(0xff1b);
      expect(keyToKeysym('backspace')).toBe(0xff08);
      expect(keyToKeysym('delete')).toBe(0xffff);
      expect(keyToKeysym('space')).toBe(0x0020);
    });

    it('should map arrow keys correctly', () => {
      expect(keyToKeysym('left')).toBe(0xff51);
      expect(keyToKeysym('up')).toBe(0xff52);
      expect(keyToKeysym('right')).toBe(0xff53);
      expect(keyToKeysym('down')).toBe(0xff54);
      expect(keyToKeysym('arrowleft')).toBe(0xff51);
      expect(keyToKeysym('arrowup')).toBe(0xff52);
    });

    it('should map function keys correctly', () => {
      expect(keyToKeysym('f1')).toBe(0xffbe);
      expect(keyToKeysym('f12')).toBe(0xffc9);
    });

    it('should map modifier keys correctly', () => {
      expect(keyToKeysym('shift')).toBe(0xffe1);
      expect(keyToKeysym('ctrl')).toBe(0xffe3);
      expect(keyToKeysym('control')).toBe(0xffe3);
      expect(keyToKeysym('alt')).toBe(0xffe9);
      expect(keyToKeysym('meta')).toBe(0xffe7);
      expect(keyToKeysym('command')).toBe(0xffe7);
    });

    it('should map single ASCII characters to their char code', () => {
      expect(keyToKeysym('a')).toBe(0x61);
      expect(keyToKeysym('A')).toBe(0x41);
      expect(keyToKeysym('z')).toBe(0x7a);
      expect(keyToKeysym('0')).toBe(0x30);
      expect(keyToKeysym('9')).toBe(0x39);
      expect(keyToKeysym(' ')).toBe(0x20);
      expect(keyToKeysym('/')).toBe(0x2f);
    });

    it('should handle case-insensitive special key lookup', () => {
      expect(keyToKeysym('Return')).toBe(0xff0d);
      expect(keyToKeysym('ESCAPE')).toBe(0xff1b);
      expect(keyToKeysym('Tab')).toBe(0xff09);
    });

    it('should map non-ASCII characters using Unicode keysym range', () => {
      const result = keyToKeysym('中');
      expect(result).toBe(0x01000000 + '中'.charCodeAt(0));
    });

    it('should throw for unknown multi-char key names', () => {
      expect(() => keyToKeysym('unknownkey')).toThrow('Unknown key');
    });
  });

  describe('modifierToKeysym', () => {
    it('should map all modifier names correctly', () => {
      expect(modifierToKeysym('shift')).toBe(0xffe1);
      expect(modifierToKeysym('ctrl')).toBe(0xffe3);
      expect(modifierToKeysym('control')).toBe(0xffe3);
      expect(modifierToKeysym('alt')).toBe(0xffe9);
      expect(modifierToKeysym('meta')).toBe(0xffe7);
      expect(modifierToKeysym('command')).toBe(0xffe7);
      expect(modifierToKeysym('cmd')).toBe(0xffe7);
      expect(modifierToKeysym('super')).toBe(0xffeb);
      expect(modifierToKeysym('win')).toBe(0xffeb);
      expect(modifierToKeysym('option')).toBe(0xffe9);
    });

    it('should be case-insensitive', () => {
      expect(modifierToKeysym('Shift')).toBe(0xffe1);
      expect(modifierToKeysym('CTRL')).toBe(0xffe3);
    });

    it('should throw for unknown modifier', () => {
      expect(() => modifierToKeysym('foobar')).toThrow('Unknown modifier');
    });
  });

  describe('X11_KEYSYM table', () => {
    it('should have navigation keys', () => {
      expect(X11_KEYSYM.home).toBe(0xff50);
      expect(X11_KEYSYM.end).toBe(0xff57);
      expect(X11_KEYSYM.pageup).toBe(0xff55);
      expect(X11_KEYSYM.pagedown).toBe(0xff56);
      expect(X11_KEYSYM.insert).toBe(0xff63);
    });

    it('should have keypad keys', () => {
      expect(X11_KEYSYM.kp_0).toBe(0xffb0);
      expect(X11_KEYSYM.kp_9).toBe(0xffb9);
      expect(X11_KEYSYM.kp_enter).toBe(0xff8d);
    });

    it('should have media keys', () => {
      expect(X11_KEYSYM.audio_vol_up).toBe(0x1008ff13);
      expect(X11_KEYSYM.audio_vol_down).toBe(0x1008ff11);
      expect(X11_KEYSYM.audio_mute).toBe(0x1008ff12);
    });
  });
});
