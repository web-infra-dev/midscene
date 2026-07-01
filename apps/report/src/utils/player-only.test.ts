import { describe, expect, it } from 'vitest';
import { parsePlayerOnlyParam } from './player-only';

describe('parsePlayerOnlyParam', () => {
  it('returns false when the param is absent', () => {
    expect(parsePlayerOnlyParam('')).toBe(false);
    expect(parsePlayerOnlyParam('?focusOnCursor=true')).toBe(false);
  });

  it('treats a bare flag as enabled', () => {
    expect(parsePlayerOnlyParam('?playerOnly')).toBe(true);
    expect(parsePlayerOnlyParam('?playerOnly=')).toBe(true);
  });

  it('accepts truthy values regardless of case and whitespace', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on', ' On ']) {
      expect(
        parsePlayerOnlyParam(`?playerOnly=${encodeURIComponent(value)}`),
      ).toBe(true);
    }
  });

  it('rejects falsy or unknown values', () => {
    for (const value of ['0', 'false', 'no', 'off', 'nope']) {
      expect(parsePlayerOnlyParam(`?playerOnly=${value}`)).toBe(false);
    }
  });

  it('coexists with other query params', () => {
    expect(parsePlayerOnlyParam('?darkMode=true&playerOnly=1')).toBe(true);
  });
});
