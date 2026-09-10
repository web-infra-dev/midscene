import { describe, expect, it, rs } from '@rstest/core';
import ScrcpyServer, {
  appendBoundedScrcpyOutput,
  buildScrcpyVideoPacket,
  resolveRequestedDeviceId,
} from '../../src/scrcpy-server';

const {
  mockExecFile,
  mockStart,
  mockOptionsCtor,
  mockResolveExternalResourcePath,
} = rs.hoisted(() => ({
  mockExecFile: rs.fn(
    (
      _file: string,
      _args: string[],
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, '', '');
    },
  ),
  mockStart: rs.fn(),
  mockOptionsCtor: rs.fn((options) => options),
  mockResolveExternalResourcePath: rs.fn(
    (_resourcePath: string) => '/unpacked/scrcpy-server',
  ),
}));

rs.mock('node:child_process', () => ({ execFile: mockExecFile }));

rs.mock('@midscene/android', () => ({
  resolveExternalResourcePath: mockResolveExternalResourcePath,
}));

rs.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyClient: {
    start: mockStart,
  },
  AdbScrcpyOptions3_3_3: mockOptionsCtor,
}));

rs.mock('@yume-chan/scrcpy', () => ({
  DefaultServerPath: '/mocked/scrcpy-server.jar',
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
    mockStart.mockResolvedValue({ videoStream: Promise.resolve(null) });

    const server = new ScrcpyServer();
    server.currentDeviceId = 'another-device';
    const adb = { serial: 'device-1' };
    const onProgress = rs.fn();

    await (server as any).startScrcpy(
      adb,
      { maxSize: 0, videoBitRate: 8_000_000 },
      onProgress,
    );

    expect(mockExecFile).toHaveBeenCalledWith(
      'adb',
      [
        '-s',
        'device-1',
        'push',
        '/unpacked/scrcpy-server',
        '/mocked/scrcpy-server.jar',
      ],
      expect.any(Function),
    );
    expect(mockResolveExternalResourcePath).toHaveBeenCalledWith(
      expect.stringContaining('bin/scrcpy-server'),
    );
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

  it('maps upstream keyframe metadata to the socket contract', () => {
    const packet = {
      type: 'data' as const,
      data: new Uint8Array([1, 2, 3]),
      keyframe: true,
    };

    expect(buildScrcpyVideoPacket(packet, 123)).toEqual({
      data: packet.data,
      type: 'data',
      timestamp: 123,
      keyFrame: true,
    });
    expect(
      buildScrcpyVideoPacket(
        { type: 'configuration', data: new Uint8Array([9]) },
        456,
      ),
    ).toEqual({
      data: new Uint8Array([9]),
      type: 'configuration',
      timestamp: 456,
      keyFrame: undefined,
    });
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

describe('Scrcpy listen address', () => {
  it.each([undefined, '0.0.0.0'])(
    'binds to the default loopback or explicit host %s',
    async (host) => {
      const server = new ScrcpyServer({
        host,
        deviceListSource: {
          getDevices: async () => [],
          subscribe: () => () => {},
        },
      });
      try {
        await server.launch(0);
        expect((server.httpServer.address() as any).address).toBe(
          host ?? '127.0.0.1',
        );
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/devices`,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          devices: [],
          currentDeviceId: null,
        });
      } finally {
        server.close();
      }
    },
  );
  it('rejects an occupied port instead of hanging', async () => {
    const options = {
      deviceListSource: {
        getDevices: async () => [],
        subscribe: () => () => {},
      },
    };
    const first = new ScrcpyServer(options);
    const second = new ScrcpyServer(options);
    try {
      await first.launch(0);
      await expect(second.launch(first.port!)).rejects.toThrow();
    } finally {
      first.close();
      second.close();
    }
  });
});
