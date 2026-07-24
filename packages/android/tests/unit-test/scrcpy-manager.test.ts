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
      expect(options.videoBitRate).toBe(100_000_000);
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
      expect(options.videoBitRate).toBe(100_000_000); // default
      expect(options.idleTimeoutMs).toBe(30_000); // default
    });

    it('should clamp videoBitRate to safe maximum', () => {
      const manager = new ScrcpyScreenshotManager({} as any, {
        videoBitRate: 500_000_000,
      });
      const options = (manager as any).options;
      expect(options.videoBitRate).toBe(100_000_000);
    });
  });

  describe('getResolution', () => {
    it('should return null when not connected', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      expect(manager.getResolution()).toBeNull();
    });
  });

  describe('getScreenshotJpeg', () => {
    it('does not reuse a frame captured before the latest interaction', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const staleFrame = Buffer.from('stale');
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = staleFrame;
      (manager as any).lastRawKeyframeAt = 100;

      vi.spyOn(manager, 'ensureConnected').mockResolvedValue();
      vi.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      vi.spyOn(manager as any, 'waitForNextKeyframe').mockRejectedValueOnce(
        new Error('no immediate frame'),
      );
      const decode = vi
        .spyOn(manager as any, 'decodeH264ToJpeg')
        .mockResolvedValue(Buffer.from('jpeg'));

      await expect(manager.getScreenshotJpeg(101)).rejects.toThrow(
        'did not produce a fresh frame',
      );

      expect(decode).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('ensureConnected', () => {
    it('should throw instead of recursing when isConnecting is true', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      (manager as any).isConnecting = true;

      await expect(manager.ensureConnected()).rejects.toThrow(
        /another connection attempt/,
      );
    });

    it('should return immediately if already connected', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      (manager as any).scrcpyClient = {};
      (manager as any).videoStream = {};

      // Should not throw
      await expect(manager.ensureConnected()).resolves.toBeUndefined();
    });

    it('should succeed if another connection finishes while waiting', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      (manager as any).isConnecting = true;

      // Simulate the other connection finishing during the wait
      setTimeout(() => {
        (manager as any).scrcpyClient = {};
        (manager as any).videoStream = {};
      }, 100);

      await expect(manager.ensureConnected()).resolves.toBeUndefined();
    });

    it('should include client and server output in connection errors', () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const error = Object.assign(new Error('ExactReadable ended'), {
        output: ['server exited before metadata'],
      });

      const result = (manager as any).createConnectionError(error, [
        'java.lang.IllegalStateException: codec not ready',
      ]);

      expect(result.message).toContain('ExactReadable ended');
      expect(result.message).toContain('server exited before metadata');
      expect(result.message).toContain(
        'java.lang.IllegalStateException: codec not ready',
      );
    });

    it('should bound collected server output to the latest lines', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const lines: string[] = [];
      const output = new ReadableStream<string>({
        start(controller) {
          for (let index = 0; index < 110; index++) {
            controller.enqueue(`line-${index}`);
          }
          controller.close();
        },
      });

      await (manager as any).collectServerOutput(output, lines);

      expect(lines).toHaveLength(100);
      expect(lines[0]).toBe('line-10');
      expect(lines.at(-1)).toBe('line-109');
    });
  });

  describe('consumeFramesLoop', () => {
    it('should absorb a rejected cancellation after a stream read error', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const streamError = new Error(
        'The underlying readable ended before the struct was deserialized',
      );
      const reader = {
        read: vi.fn().mockRejectedValue(streamError),
        cancel: vi.fn().mockRejectedValue(streamError),
      };
      const close = vi.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = reader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await expect(
        (manager as any).consumeFramesLoop(reader),
      ).resolves.toBeUndefined();

      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(manager.isConnected()).toBe(false);
    });

    it('should disconnect the current session after a clean stream end', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const reader = {
        read: vi.fn().mockResolvedValue({ done: true }),
        cancel: vi.fn().mockResolvedValue(undefined),
      };
      const close = vi.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = reader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await (manager as any).consumeFramesLoop(reader);

      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(manager.isConnected()).toBe(false);
    });

    it('should not disconnect a replacement session when an obsolete reader ends', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const obsoleteReader = {
        read: vi.fn().mockResolvedValue({ done: true }),
        cancel: vi.fn().mockResolvedValue(undefined),
      };
      const replacementReader = {
        cancel: vi.fn().mockResolvedValue(undefined),
      };
      const close = vi.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = replacementReader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await (manager as any).consumeFramesLoop(obsoleteReader);

      expect(obsoleteReader.cancel).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(manager.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should reset all state', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      // Manually populate state to verify cleanup
      (manager as any).spsHeader = Buffer.from('sps');
      (manager as any).lastRawKeyframe = Buffer.from('keyframe');
      (manager as any).isInitialized = true;
      (manager as any).keyframeResolvers = [() => {}];
      (manager as any).streamReader = { cancel: vi.fn() };

      await manager.disconnect();

      expect((manager as any).spsHeader).toBeNull();
      expect((manager as any).lastRawKeyframe).toBeNull();
      expect((manager as any).isInitialized).toBe(false);
      expect((manager as any).keyframeResolvers).toEqual([]);
      expect((manager as any).videoStream).toBeNull();
      expect((manager as any).scrcpyClient).toBeNull();
      expect((manager as any).streamReader).toBeNull();
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
      // References are nulled before close is called
      expect((manager as any).scrcpyClient).toBeNull();
    });

    it('should cancel streamReader to stop consumeFramesLoop', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      const cancelFn = vi.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = { cancel: cancelFn };

      await manager.disconnect();

      expect(cancelFn).toHaveBeenCalled();
      expect((manager as any).streamReader).toBeNull();
    });

    it('should wait for asynchronous streamReader cancellation', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      let resolveCancel: (() => void) | undefined;
      const cancelPromise = new Promise<void>((resolve) => {
        resolveCancel = resolve;
      });
      (manager as any).streamReader = {
        cancel: vi.fn().mockReturnValue(cancelPromise),
      };

      let disconnected = false;
      const disconnectPromise = manager.disconnect().then(() => {
        disconnected = true;
      });
      await Promise.resolve();

      expect(disconnected).toBe(false);

      resolveCancel?.();
      await disconnectPromise;
      expect(disconnected).toBe(true);
    });

    it('should handle streamReader.cancel() error gracefully', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      (manager as any).streamReader = {
        cancel: vi.fn().mockRejectedValue(new Error('stream already errored')),
      };

      await expect(manager.disconnect()).resolves.toBeUndefined();
      expect((manager as any).streamReader).toBeNull();
    });

    it('should null references before awaiting close to prevent race conditions', async () => {
      const manager = new ScrcpyScreenshotManager({} as any);
      let clientNulledBeforeClose = false;
      (manager as any).scrcpyClient = {
        close: vi.fn().mockImplementation(async () => {
          // At this point, scrcpyClient should already be null
          clientNulledBeforeClose = (manager as any).scrcpyClient === null;
        }),
      };
      (manager as any).videoStream = {};

      await manager.disconnect();

      expect(clientNulledBeforeClose).toBe(true);
      expect((manager as any).videoStream).toBeNull();
    });
  });
});
