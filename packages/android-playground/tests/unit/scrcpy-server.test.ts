import * as nodeFsActual from 'node:fs' with { rstest: 'importActual' };
import { describe, expect, it, rs } from '@rstest/core';
import ScrcpyServer, {
  appendBoundedScrcpyOutput,
  resolveRequestedDeviceId,
} from '../../src/scrcpy-server';

const {
  mockPushServer,
  mockStart,
  mockReadableFrom,
  mockCreateReadStream,
  mockOptionsCtor,
} = rs.hoisted(() => ({
  mockPushServer: rs.fn(),
  mockStart: rs.fn(),
  mockReadableFrom: rs.fn(),
  mockCreateReadStream: rs.fn(),
  mockOptionsCtor: rs.fn((options) => options),
}));

rs.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyClient: {
    pushServer: mockPushServer,
    start: mockStart,
  },
  AdbScrcpyOptions3_3_3: mockOptionsCtor,
}));

rs.mock('@yume-chan/stream-extra', () => ({
  ReadableStream: {
    from: mockReadableFrom,
  },
}));

rs.mock('@yume-chan/scrcpy', () => ({
  DefaultServerPath: '/mocked/scrcpy-server.jar',
}));

rs.mock('node:fs', () => ({
  ...nodeFsActual,
  createReadStream: mockCreateReadStream,
}));

describe('ScrcpyServer', () => {
  it('allows short event-loop stalls without dropping the preview heartbeat', () => {
    const server = new ScrcpyServer();
    expect((server as any).io.engine.opts.pingInterval).toBe(25_000);
    expect((server as any).io.engine.opts.pingTimeout).toBe(60_000);
  });

  it('keeps only the most recent scrcpy output lines', () => {
    const lines: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      appendBoundedScrcpyOutput(lines, `line-${index}`, 3);
    }
    expect(lines).toEqual(['line-2', 'line-3', 'line-4']);
  });

  it('prefers the explicit device from the preview handshake', () => {
    expect(
      resolveRequestedDeviceId(
        { deviceId: 'SERIAL123', maxSize: 0, videoBitRate: 8_000_000 },
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
    const onProgress = rs.fn();

    await (server as any).startScrcpy(
      adb,
      { maxSize: 0, videoBitRate: 8_000_000 },
      onProgress,
    );

    expect(mockPushServer).toHaveBeenCalledOnce();
    expect(mockOptionsCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        control: true,
        maxSize: 0,
        sendFrameMeta: true,
        videoBitRate: 8_000_000,
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
    const unsubscribe = rs.fn();
    const getDevices = rs.fn().mockResolvedValue([
      {
        id: 'device-1',
        name: 'Pixel 9',
        status: 'device',
      },
    ]);
    const subscribe = rs.fn((listener: (devices: any[]) => void) => {
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
    const emitSpy = rs.spyOn(server.io, 'emit');

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
