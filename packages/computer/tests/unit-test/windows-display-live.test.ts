import { describe, expect, it } from '@rstest/core';
import { readWindowsDisplayGeometries } from '../../src/windows-display';

describe.skipIf(process.platform !== 'win32')(
  'Windows display enumeration live diagnostics',
  () => {
    it('enumerates physical displays with Per-Monitor V2 through Command', () => {
      const displays = readWindowsDisplayGeometries();

      console.info(
        '[Windows display enumeration diagnostics]',
        JSON.stringify({ physicalDisplayCount: displays.length, displays }),
      );

      expect(displays.length).toBeGreaterThan(0);
      expect(displays.some((display) => display.primary)).toBe(true);
    });
  },
);
