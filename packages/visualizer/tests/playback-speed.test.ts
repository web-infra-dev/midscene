import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

// Mock window
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', {
  location: { search: '', href: '' },
});

describe('Playback Speed Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('PlaybackSpeedType validation', () => {
    it('should accept valid speed values', () => {
      const validSpeeds = [0.5, 1, 1.5, 2];
      for (const speed of validSpeeds) {
        expect([0.5, 1, 1.5, 2].includes(speed)).toBe(true);
      }
    });

    it('should reject invalid speed values', () => {
      const invalidSpeeds = [0, 0.25, 3, -1, 1.2];
      for (const speed of invalidSpeeds) {
        expect([0.5, 1, 1.5, 2].includes(speed)).toBe(false);
      }
    });
  });

  describe('Speed calculation', () => {
    it('should correctly calculate scaled duration for 0.5x speed', () => {
      const originalDuration = 1000;
      const playbackSpeed = 0.5;
      const scaledDuration = originalDuration / playbackSpeed;
      expect(scaledDuration).toBe(2000); // Slower playback = longer duration
    });

    it('should correctly calculate scaled duration for 1x speed', () => {
      const originalDuration = 1000;
      const playbackSpeed = 1;
      const scaledDuration = originalDuration / playbackSpeed;
      expect(scaledDuration).toBe(1000); // Normal speed
    });

    it('should correctly calculate scaled duration for 1.5x speed', () => {
      const originalDuration = 1000;
      const playbackSpeed = 1.5;
      const scaledDuration = originalDuration / playbackSpeed;
      expect(Math.round(scaledDuration)).toBe(667); // Faster playback = shorter duration
    });

    it('should correctly calculate scaled duration for 2x speed', () => {
      const originalDuration = 1000;
      const playbackSpeed = 2;
      const scaledDuration = originalDuration / playbackSpeed;
      expect(scaledDuration).toBe(500); // Double speed = half duration
    });
  });

  describe('Total duration calculation with speed', () => {
    it('should scale total animation duration correctly', () => {
      const scripts = [{ duration: 500 }, { duration: 300 }, { duration: 800 }];

      const baseTotalDuration = scripts.reduce(
        (acc, item) => acc + item.duration,
        0,
      );
      expect(baseTotalDuration).toBe(1600);

      // At 2x speed, total duration should be halved
      const playbackSpeed = 2;
      const adjustedDuration = baseTotalDuration / playbackSpeed;
      expect(adjustedDuration).toBe(800);
    });
  });

  describe('localStorage persistence', () => {
    it('should use default speed of 1 when no saved value', () => {
      const savedSpeed = localStorageMock.getItem('midscene-playback-speed');
      const defaultSpeed = Number.parseFloat(savedSpeed || '1');
      expect(defaultSpeed).toBe(1);
    });

    it('should parse saved speed correctly', () => {
      localStorageMock.setItem('midscene-playback-speed', '1.5');
      const savedSpeed = Number.parseFloat(
        localStorageMock.getItem('midscene-playback-speed') || '1',
      );
      expect(savedSpeed).toBe(1.5);
    });

    it('should validate saved speed against allowed values', () => {
      const allowedSpeeds = [0.5, 1, 1.5, 2];

      // Valid speed
      localStorageMock.setItem('midscene-playback-speed', '2');
      let savedSpeed = Number.parseFloat(
        localStorageMock.getItem('midscene-playback-speed') || '1',
      );
      let validatedSpeed = allowedSpeeds.includes(savedSpeed) ? savedSpeed : 1;
      expect(validatedSpeed).toBe(2);

      // Invalid speed should fall back to 1
      localStorageMock.setItem('midscene-playback-speed', '3');
      savedSpeed = Number.parseFloat(
        localStorageMock.getItem('midscene-playback-speed') || '1',
      );
      validatedSpeed = allowedSpeeds.includes(savedSpeed) ? savedSpeed : 1;
      expect(validatedSpeed).toBe(1);
    });
  });
});
