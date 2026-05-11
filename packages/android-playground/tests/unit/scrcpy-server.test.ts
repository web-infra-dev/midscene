import { describe, expect, it, vi } from 'vitest';
import ScrcpyServer, {
  resolveRequestedDeviceId,
} from '../../src/scrcpy-server';

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

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: mockCreateReadStream,
  };
});

describe('ScrcpyServer', () => {
  it('prefers the explicit device from the preview handshake', () => {
    expect(
      resolveRequestedDeviceId(
        { deviceId: 'SERIAL123', maxSize: 1024 },
        'OLD_DEVICE',
      ),
    ).toBe('SERIAL123');
    expect(resolveRequestedDeviceId({ deviceId: '  ' }, 'OLD_DEVICE')).toBe(
      'OLD_DEVICE',
    );
    expect(resolveRequestedDeviceId({}, null)).toBeUndefined();
  });

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

  it('can consume device list updates from an external discovery source', async () => {
    const unsubscribe = vi.fn();
    const getDevices = vi.fn().mockResolvedValue([
      {
        id: 'device-1',
        name: 'Pixel 9',
        status: 'device',
      },
    ]);
    const subscribe = vi.fn((listener: (devices: any[]) => void) => {
      listener([
        {
          id: 'device-2',
          name: 'Pixel 10',
          status: 'device',
        },
      ]);
      return unsubscribe;
    });

    const server = new ScrcpyServer({
      deviceListSource: {
        getDevices,
        subscribe,
      },
    });
    const emitSpy = vi.spyOn(server.io, 'emit');

    (server as any).startDeviceMonitoring();
    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(getDevices).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('devices-list', {
      devices: [
        {
          id: 'device-2',
          name: 'Pixel 10',
          status: 'device',
        },
      ],
      currentDeviceId: 'device-2',
    });

    server.close();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
