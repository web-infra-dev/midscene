import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrcpyScreenshotManager } from '../../src/scrcpy-manager';

describe('ScrcpyScreenshotManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateEnvironment', () => {
    it('should succeed when ffmpeg is available', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      vi.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(true);

      await expect(manager.validateEnvironment()).resolves.toBeUndefined();
    });

    it('should throw when ffmpeg is not available', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      vi.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(false);

      await expect(manager.validateEnvironment()).rejects.toThrow(
        'ffmpeg is not available',
      );
    });

    it('should throw when checkFfmpegAvailable throws an error', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      vi.spyOn(manager as any, 'checkFfmpegAvailable').mockRejectedValue(
        new Error('unexpected error'),
      );

      await expect(manager.validateEnvironment()).rejects.toThrow(
        'ffmpeg is not available',
      );
    });

    it('should cache ffmpeg check result (only check once on success)', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const spy = vi
        .spyOn(manager as any, 'checkFfmpegAvailable')
        .mockResolvedValue(true);

      await manager.validateEnvironment();
      await manager.validateEnvironment();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should be independent from ensureConnected', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      vi.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(true);

      // validateEnvironment should not trigger ensureConnected logic
      const ensureConnectedSpy = vi.spyOn(manager, 'ensureConnected');

      await manager.validateEnvironment();

      expect(ensureConnectedSpy).not.toHaveBeenCalled();
    });
  });

  describe('constructor defaults', () => {
    it('should use default options when none provided', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const options = (manager as any).options;
      expect(options.maxSize).toBe(0);
      expect(options.videoBitRate).toBe(2_000_000);
      expect(options.idleTimeoutMs).toBe(30_000);
    });

    it('should use provided options', () => {
      const manager = new ScrcpyScreenshotManager({} as any, {
        maxSize: 1024,
        videoBitRate: 4_000_000,
        idleTimeoutMs: 60_000,
      });
      const options = (manager as any).options;
      expect(options.maxSize).toBe(1024);
      expect(options.videoBitRate).toBe(4_000_000);
      expect(options.idleTimeoutMs).toBe(60_000);
    });

    it('should partially override defaults', () => {
      const manager = new ScrcpyScreenshotManager({} as any, {
        maxSize: 512,
      });
      const options = (manager as any).options;
      expect(options.maxSize).toBe(512);
      expect(options.videoBitRate).toBe(2_000_000); // default
      expect(options.idleTimeoutMs).toBe(30_000); // default
    });
  });

  describe('getResolution', () => {
    it('should return null when not connected', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      expect(manager.getResolution()).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should reset all state', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      // Manually populate state to verify cleanup
      (manager as any).lastFrameBuffer = Buffer.from('frame');
      (manager as any).lastFrameTimestamp = 12345;
      (manager as any).spsHeader = Buffer.from('sps');
      (manager as any).latestFrameBuffer = Buffer.from('latest');
      (manager as any).latestFrameTimestamp = 67890;
      (manager as any).isInitialized = true;
      (manager as any).h264SearchConfigFn = () => {};
      (manager as any).recentFrames = [Buffer.from('a'), Buffer.from('b')];

      await manager.disconnect();

      expect((manager as any).lastFrameBuffer).toBeNull();
      expect((manager as any).lastFrameTimestamp).toBe(0);
      expect((manager as any).spsHeader).toBeNull();
      expect((manager as any).latestFrameBuffer).toBeNull();
      expect((manager as any).latestFrameTimestamp).toBe(0);
      expect((manager as any).isInitialized).toBe(false);
      expect((manager as any).h264SearchConfigFn).toBeNull();
      expect((manager as any).recentFrames).toEqual([]);
      expect((manager as any).videoStream).toBeNull();
      expect((manager as any).scrcpyClient).toBeNull();
    });

    it('should clear idle timer', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const timer = setTimeout(() => {}, 10000);
      (manager as any).idleTimer = timer;

      await manager.disconnect();

      expect((manager as any).idleTimer).toBeNull();
    });

    it('should handle scrcpyClient.close() error gracefully', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      (manager as any).scrcpyClient = {
        close: vi.fn().mockRejectedValue(new Error('close failed')),
      };

      // Should not throw
      await expect(manager.disconnect()).resolves.toBeUndefined();
      expect((manager as any).scrcpyClient).toBeNull();
    });
  });
});
