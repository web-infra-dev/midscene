import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { createAdbAndroidSetup } from '../../src/test-runner';

const mocks = rs.hoisted(() => ({
  device: { connect: rs.fn(), destroy: rs.fn() },
  agent: { destroy: rs.fn() },
  Device: rs.fn(),
  Agent: rs.fn(),
  getConnectedDevices: rs.fn(),
}));
rs.mock('@midscene/android', () => ({
  AndroidDevice: mocks.Device,
  AndroidAgent: mocks.Agent,
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

describe('createAdbAndroidSetup lifecycle', () => {
  it('does no device discovery or connection when the definition is created', () => {
    createAdbAndroidSetup();
    expect(mocks.Device).not.toHaveBeenCalled();
    expect(mocks.Agent).not.toHaveBeenCalled();
    expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
  });

  it('creates an independent Agent for each invocation and releases the Device through its Agent', async () => {
    const setup = createAdbAndroidSetup();
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
    await expect(createAdbAndroidSetup().setup(run.input)).rejects.toThrow(
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
      await expect(createAdbAndroidSetup().setup(run.input)).rejects.toThrow(
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
    await createAdbAndroidSetup().setup(run.input);
    mocks.agent.destroy.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(run.teardowns[0]()).rejects.toThrow('cleanup failed');
  });
});

it('uses an explicit device ID ahead of the lifecycle environment and forwards SDK options', async () => {
  const run = lifecycle({ ANDROID_DEVICE_ID: 'other-device' });
  const options = {
    deviceId: 'usb-device',
    androidAdbPath: '/custom/adb',
    appNameMapping: { Example: 'com.example.app' },
  };
  await createAdbAndroidSetup(options).setup(run.input);
  const { deviceId, ...sdkOptions } = options;
  expect(mocks.Device).toHaveBeenCalledWith(deviceId, sdkOptions);
  expect(mocks.Agent).toHaveBeenCalledWith(mocks.device, sdkOptions);
  expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
});

it('reads ANDROID_DEVICE_ID at execution time', async () => {
  const setup = createAdbAndroidSetup();
  await setup.setup(lifecycle({ ANDROID_DEVICE_ID: 'env-device' }).input);
  expect(mocks.Device).toHaveBeenCalledWith('env-device', {});
  expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
});

it('uses the first connected ADB device only when no ID is configured', async () => {
  await createAdbAndroidSetup({ androidAdbPath: '/custom/adb' }).setup(
    lifecycle().input,
  );
  expect(mocks.getConnectedDevices).toHaveBeenCalledWith({
    androidAdbPath: '/custom/adb',
  });
  expect(mocks.Device).toHaveBeenCalledWith('first-adb-device', {
    androidAdbPath: '/custom/adb',
  });
});

it('rejects an empty explicit device ID without selecting another device', async () => {
  await expect(
    createAdbAndroidSetup({ deviceId: ' ' }).setup(lifecycle().input),
  ).rejects.toThrow('deviceId');
  expect(mocks.getConnectedDevices).not.toHaveBeenCalled();
  expect(mocks.Device).not.toHaveBeenCalled();
});

it('fails when no ADB devices exist without creating an Agent', async () => {
  mocks.getConnectedDevices.mockResolvedValueOnce([]);
  await expect(
    createAdbAndroidSetup().setup(lifecycle().input),
  ).rejects.toThrow('No Android devices');
  expect(mocks.Device).not.toHaveBeenCalled();
  expect(mocks.Agent).not.toHaveBeenCalled();
});

it('honors cancellation after discovery before constructing a Device', async () => {
  const run = lifecycle();
  mocks.getConnectedDevices.mockImplementationOnce(async () => {
    run.controller.abort(new Error('cancelled'));
    return [{ udid: 'device' }];
  });
  await expect(createAdbAndroidSetup().setup(run.input)).rejects.toThrow(
    'cancelled',
  );
  expect(mocks.Device).not.toHaveBeenCalled();
});
