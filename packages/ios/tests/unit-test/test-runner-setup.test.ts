import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createWdaIOSSetup } from '../../src/test-runner';

const mocks = rs.hoisted(() => ({
  device: { connect: rs.fn(), destroy: rs.fn() },
  agent: { destroy: rs.fn() },
  Device: rs.fn(),
  Agent: rs.fn(),
  getConnectedDevices: rs.fn(),
}));
rs.mock('@midscene/ios', () => ({
  IOSDevice: mocks.Device,
  IOSAgent: mocks.Agent,
  getConnectedDevices: mocks.getConnectedDevices,
}));

beforeEach(() => {
  rs.clearAllMocks();
  mocks.Device.mockImplementation(() => mocks.device);
  mocks.Agent.mockImplementation(() => mocks.agent);
  mocks.device.connect.mockReset().mockResolvedValue(undefined);
  mocks.device.destroy.mockReset().mockResolvedValue(undefined);
  mocks.agent.destroy.mockReset().mockImplementation(async () => {
    await mocks.device.destroy();
  });
  mocks.getConnectedDevices
    .mockReset()
    .mockResolvedValue([{ udid: 'first-adb-device' }]);
});

function lifecycle(env: Readonly<NodeJS.ProcessEnv> = {}) {
  const controller = new AbortController();
  const teardowns: Array<() => void | Promise<void>> = [];
  return {
    controller,
    teardowns,
    input: {
      env,
      signal: controller.signal,
      project: {
        name: 'mobile',
        projectId: 'mobile',
        tags: { include: [], exclude: [] },
        retry: 0,
        variables: {},
      },
      projectContext: undefined,
      file: {
        documentId: 'file',
        documentRunId: 'run',
        sourcePath: 'cases/test.yaml',
      },
      onTeardown(callback: () => void | Promise<void>) {
        teardowns.push(callback);
      },
    },
  };
}

describe('createWdaIOSSetup lifecycle', () => {
  it('does no device discovery or connection when the definition is created', () => {
    createWdaIOSSetup();
    expect(mocks.Device).not.toHaveBeenCalled();
    expect(mocks.Agent).not.toHaveBeenCalled();
    expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
  });

  it('creates an independent Agent for each invocation and releases the Device through its Agent', async () => {
    const setup = createWdaIOSSetup();
    const first = lifecycle();
    const second = lifecycle();
    expect(await setup.setup(first.input)).toEqual({ agent: mocks.agent });
    await setup.setup(second.input);
    expect(mocks.Device).toHaveBeenCalledTimes(2);
    expect(mocks.Agent).toHaveBeenCalledTimes(2);
    expect(first.teardowns).toHaveLength(1);
    await first.teardowns[0]();
    expect(mocks.agent.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.device.destroy).toHaveBeenCalledTimes(1);
    expect(second.teardowns).toHaveLength(1);
  });

  it('stops before discovery or construction when already cancelled', async () => {
    const run = lifecycle();
    run.controller.abort(new Error('cancelled'));
    await expect(createWdaIOSSetup().setup(run.input)).rejects.toThrow(
      'cancelled',
    );
    expect(mocks.Device).not.toHaveBeenCalled();
    expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
  });

  it.each(['connect', 'agent', 'cancel'])(
    'registers Device cleanup before %s failure',
    async (stage) => {
      const run = lifecycle();
      const failure = new Error('setup failed');
      if (stage === 'connect')
        mocks.device.connect.mockRejectedValueOnce(failure);
      if (stage === 'agent')
        mocks.Agent.mockImplementationOnce(() => {
          throw failure;
        });
      if (stage === 'cancel')
        mocks.device.connect.mockImplementationOnce(async () => {
          run.controller.abort(failure);
        });
      await expect(createWdaIOSSetup().setup(run.input)).rejects.toThrow(
        'setup failed',
      );
      expect(run.teardowns).toHaveLength(1);
      await run.teardowns[0]();
      expect(mocks.device.destroy).toHaveBeenCalledTimes(1);
      expect(mocks.agent.destroy).not.toHaveBeenCalled();
    },
  );

  it('propagates cleanup failures to the Runner', async () => {
    const run = lifecycle();
    await createWdaIOSSetup().setup(run.input);
    mocks.agent.destroy.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(run.teardowns[0]()).rejects.toThrow('cleanup failed');
  });
});

it('uses the default local WDA endpoint', async () => {
  await createWdaIOSSetup().setup(lifecycle().input);
  expect(mocks.Device).toHaveBeenCalledWith({
    wdaHost: 'localhost',
    wdaPort: 8100,
  });
});

it('resolves WDA and MJPEG environment variables during setup', async () => {
  const setup = createWdaIOSSetup();
  await setup.setup(
    lifecycle({
      WDA_HOST: 'wda-host',
      WDA_PORT: '8200',
      WDA_MJPEG_PORT: '9200',
    }).input,
  );
  expect(mocks.Device).toHaveBeenCalledWith({
    wdaHost: 'wda-host',
    wdaPort: 8200,
    wdaMjpegPort: 9200,
  });
});

it('supports WDA gateway and MJPEG URLs without adding host/port defaults', async () => {
  const run = lifecycle({
    WDA_BASE_URL: 'https://gateway.example/wda',
    WDA_MJPEG_URL: 'https://gateway.example/mjpeg',
  });
  await createWdaIOSSetup().setup(run.input);
  expect(mocks.Device).toHaveBeenCalledWith({
    wdaBaseUrl: 'https://gateway.example/wda',
    wdaMjpegUrl: 'https://gateway.example/mjpeg',
  });
});

it('uses explicit connection groups ahead of environment groups and forwards session and Agent options', async () => {
  const run = lifecycle({
    WDA_BASE_URL: 'https://other.example/wda',
    WDA_MJPEG_URL: 'https://other.example/mjpeg',
  });
  const options = {
    wdaHost: '127.0.0.1',
    wdaPort: 8300,
    wdaMjpegPort: 9300,
    sessionId: 'existing-session',
    appNameMapping: { Example: 'com.example.app' },
  };
  await createWdaIOSSetup(options).setup(run.input);
  expect(mocks.Device).toHaveBeenCalledWith(options);
  expect(mocks.Agent).toHaveBeenCalledWith(mocks.device, options);
});

it.each([
  { WDA_BASE_URL: 'https://gateway.example/wda', WDA_HOST: 'localhost' },
  { WDA_BASE_URL: 'https://gateway.example/wda', WDA_PORT: '8100' },
  { WDA_MJPEG_URL: 'https://gateway.example/mjpeg', WDA_MJPEG_PORT: '9100' },
])(
  'rejects conflicting environment groups before device construction: %j',
  async (env) => {
    await expect(
      createWdaIOSSetup().setup(lifecycle(env).input),
    ).rejects.toThrow('cannot be used with');
    expect(mocks.Device).not.toHaveBeenCalled();
  },
);

it.each([
  { wdaBaseUrl: 'https://gateway.example/wda', wdaHost: 'localhost' },
  { wdaMjpegUrl: 'https://gateway.example/mjpeg', wdaMjpegPort: 9100 },
])('rejects conflicting explicit options: %j', async (options) => {
  await expect(
    createWdaIOSSetup(options).setup(lifecycle().input),
  ).rejects.toThrow('cannot be used with');
  expect(mocks.Device).not.toHaveBeenCalled();
});

it.each(['0', '-1', '65536', 'NaN', '1.5'])(
  'rejects invalid WDA and MJPEG environment ports: %s',
  async (port) => {
    for (const key of ['WDA_PORT', 'WDA_MJPEG_PORT']) {
      await expect(
        createWdaIOSSetup().setup(lifecycle({ [key]: port }).input),
      ).rejects.toThrow(key);
    }
    expect(mocks.Device).not.toHaveBeenCalled();
  },
);

it.each([0, -1, 65536, Number.NaN, 1.5])(
  'rejects invalid explicit ports: %s',
  async (port) => {
    for (const key of ['wdaPort', 'wdaMjpegPort']) {
      await expect(
        createWdaIOSSetup({ [key]: port }).setup(lifecycle().input),
      ).rejects.toThrow(key);
    }
    expect(mocks.Device).not.toHaveBeenCalled();
  },
);

it('does not invoke a device-class override for the WDA factory', async () => {
  await createWdaIOSSetup().setup(
    lifecycle({ MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE: 'unrelated-driver' }).input,
  );
  expect(mocks.Device).toHaveBeenCalledTimes(1);
});
