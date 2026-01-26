import { describe, expect, it } from 'vitest';
import { ComputerDevice } from '../../src';

describe('Input Strategy', () => {
  it('should create device with default input strategy', () => {
    const device = new ComputerDevice({});
    expect(device).toBeDefined();
  });

  it('should create device with always-clipboard strategy', () => {
    const device = new ComputerDevice({
      inputStrategy: 'always-clipboard',
    });
    expect(device).toBeDefined();
  });

  it('should create device with clipboard-for-non-ascii strategy', () => {
    const device = new ComputerDevice({
      inputStrategy: 'clipboard-for-non-ascii',
    });
    expect(device).toBeDefined();
  });

  it('should detect non-ASCII characters correctly', () => {
    // Test regex pattern used in shouldUseClipboardForText
    const nonAsciiRegex = /[\x80-\uFFFF]/;

    // ASCII characters (should not match)
    expect(nonAsciiRegex.test('Hello World')).toBe(false);
    expect(nonAsciiRegex.test('hello123')).toBe(false);
    expect(nonAsciiRegex.test('test@example.com')).toBe(false);
    expect(nonAsciiRegex.test('abc_def-ghi')).toBe(false);

    // Non-ASCII characters (should match)
    expect(nonAsciiRegex.test('你好世界')).toBe(true); // Chinese
    expect(nonAsciiRegex.test('こんにちは')).toBe(true); // Japanese
    expect(nonAsciiRegex.test('안녕하세요')).toBe(true); // Korean
    expect(nonAsciiRegex.test('café')).toBe(true); // Latin extended
    expect(nonAsciiRegex.test('niño')).toBe(true); // Latin extended
    expect(nonAsciiRegex.test('😀🎉')).toBe(true); // Emoji
    expect(nonAsciiRegex.test('Привет')).toBe(true); // Cyrillic

    // Mixed text (should match)
    expect(nonAsciiRegex.test('Hello 你好')).toBe(true);
    expect(nonAsciiRegex.test('test café')).toBe(true);
    expect(nonAsciiRegex.test('abc 😀')).toBe(true);
  });

  it('should have Input action in action space', () => {
    const device = new ComputerDevice({});
    const actions = device.actionSpace();

    const inputAction = actions.find((a) => a.name === 'Input');
    expect(inputAction).toBeDefined();
    expect(inputAction?.name).toBe('Input');
    expect(inputAction?.description).toBe('Input text into the input field');
  });
});
