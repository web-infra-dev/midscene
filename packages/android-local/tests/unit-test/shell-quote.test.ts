import { describe, expect, test } from '@rstest/core';

import { quoteShellArg } from '../../src/transport/command-runner';

describe('quoteShellArg', () => {
  test('quotes plain values', () => {
    expect(quoteShellArg('screencap')).toBe("'screencap'");
  });

  test('keeps spaces inside one argument', () => {
    expect(quoteShellArg('a b  c')).toBe("'a b  c'");
  });

  test('escapes embedded single quotes', () => {
    expect(quoteShellArg("it's")).toBe("'it'\\''s'");
  });

  test('neutralises shell metacharacters', () => {
    for (const value of [
      '$(rm -rf /)',
      '`whoami`',
      'a;b',
      'a|b',
      'a&b',
      '>out',
      'a$b',
    ]) {
      const quoted = quoteShellArg(value);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      expect(quoted.slice(1, -1)).toBe(value.replace(/'/g, "'\\''"));
    }
  });

  test('quotes an empty argument as an empty string', () => {
    expect(quoteShellArg('')).toBe("''");
  });

  test('keeps non-ASCII characters intact (quoting is not transliteration)', () => {
    expect(quoteShellArg('中文 输入')).toBe("'中文 输入'");
  });
});
