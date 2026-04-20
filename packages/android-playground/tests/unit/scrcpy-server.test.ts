import { describe, expect, it, vi } from 'vitest';
import ScrcpyServer from '../../src/scrcpy-server';

const {
  mockPushServer,
  mockStart,
  mockReadableFrom,
  mockCreateReadStream,
  mockOptionsCtor,
} = vi.hoisted(() => ({
  mockPushServer: vi.fn(),
  mockStart: vi.fn(),
  mockReadableFrom: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockOptionsCtor: vi.fn((options) => options),
}));

vi.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyClient: {
    pushServer: mockPushServer,
    start: mockStart,
  },
  AdbScrcpyOptions3_3_3: mockOptionsCtor,
}));

vi.mock('@yume-chan/stream-extra', () => ({
  ReadableStream: {
    from: mockReadableFrom,
  },
}));

vi.mock('@yume-chan/scrcpy', () => ({
  DefaultServerPath: '/mocked/scrcpy-server.jar',
}));

vi.mock('node:fs', () => ({
  createReadStream: mockCreateReadStream,
}));

describe('ScrcpyServer', () => {
  it('enables frame metadata for the scrcpy web preview stream', async () => {
    mockCreateReadStream.mockReturnValue({ stream: true });
    mockReadableFrom.mockReturnValue({ readable: true });
    mockStart.mockResolvedValue({ videoStream: Promise.resolve(null) });

    const server = new ScrcpyServer();
    const adb = { serial: 'device-1' };
    const onProgress = vi.fn();

    await (server as any).startScrcpy(adb, { maxSize: 720 }, onProgress);

    expect(mockPushServer).toHaveBeenCalledOnce();
    expect(mockOptionsCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        control: true,
        maxSize: 720,
        sendFrameMeta: true,
        videoBitRate: 2_000_000,
      }),
    );
    expect(mockStart).toHaveBeenCalledWith(
      adb,
      '/mocked/scrcpy-server.jar',
      expect.objectContaining({
        sendFrameMeta: true,
      }),
    );
    expect(onProgress.mock.calls.map(([phase]) => phase)).toEqual([
      'pushing-server',
      'starting-service',
    ]);
  });
});
