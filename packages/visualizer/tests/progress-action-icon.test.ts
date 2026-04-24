import { describe, expect, it } from 'vitest';
import {
  defaultProgressActionIcon,
  resolveProgressActionIcon,
} from '../src/utils/progress-action-icon';

describe('progress-action-icon', () => {
  describe('defaultProgressActionIcon', () => {
    it('returns a react element for known kinds', () => {
      expect(defaultProgressActionIcon('Planning')).toBeTruthy();
      expect(defaultProgressActionIcon('Locate')).toBeTruthy();
      expect(defaultProgressActionIcon('Tap')).toBeTruthy();
      expect(defaultProgressActionIcon('Input')).toBeTruthy();
      expect(defaultProgressActionIcon('WaitFor')).toBeTruthy();
    });

    it('falls through to a generic action icon for unknown kinds', () => {
      // Device-specific or custom actions still get an icon rather than null.
      expect(defaultProgressActionIcon('RunAdbShell')).toBeTruthy();
      expect(defaultProgressActionIcon('CompletelyUnknown')).toBeTruthy();
    });
  });

  describe('resolveProgressActionIcon', () => {
    it('returns null when kind is missing', () => {
      expect(resolveProgressActionIcon(undefined)).toBeNull();
      expect(resolveProgressActionIcon('')).toBeNull();
    });

    it('honours an explicit host override (returning a node)', () => {
      const custom = { type: 'div' };
      expect(resolveProgressActionIcon('Tap', () => custom as any)).toBe(
        custom,
      );
    });

    it('honours an explicit null override — hides the icon slot', () => {
      expect(resolveProgressActionIcon('Tap', () => null)).toBeNull();
    });

    it('falls back to the default mapping when override returns undefined', () => {
      expect(
        resolveProgressActionIcon('Planning', () => undefined),
      ).toBeTruthy();
    });
  });
});
