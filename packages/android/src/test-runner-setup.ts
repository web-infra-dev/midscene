import type { AndroidAgent, AndroidAgentOpt } from '@midscene/android';
import type { AndroidDeviceOpt } from '@midscene/core/device';
import type { FileSetupContext } from '@midscene/core/internal/test-runner';

export type AdbAndroidSetupOptions = AndroidAgentOpt &
  AndroidDeviceOpt & {
    /** ADB device ID. Falls back to ANDROID_DEVICE_ID, then the first connected device. */
    deviceId?: string;
  };

export interface AndroidSetupContext {
  agent: AndroidAgent;
}

/** Creates an ADB Agent in the selected Project or file scope, without acquiring a device lease. */
export function createAdbAndroidSetup(options: AdbAndroidSetupOptions = {}) {
  return {
    name: 'android-adb',
    async setup({
      env,
      signal,
      onTeardown,
    }: Pick<
      FileSetupContext,
      'env' | 'signal' | 'onTeardown'
    >): Promise<AndroidSetupContext> {
      signal.throwIfAborted();
      const { deviceId: requestedId, ...sdkOptions } = options;
      if (requestedId !== undefined && !requestedId.trim()) {
        throw new Error('deviceId must be a non-empty ADB device ID.');
      }
      let deviceId = requestedId?.trim() || env.ANDROID_DEVICE_ID?.trim();
      const { AndroidDevice, AndroidAgent, getConnectedDevices } = await import(
        '@midscene/android'
      );
      signal.throwIfAborted();
      if (!deviceId) {
        const devices = await getConnectedDevices(sdkOptions);
        signal.throwIfAborted();
        if (devices.length === 0) {
          throw new Error(
            'No Android devices found. Run `adb devices` to verify the connection.',
          );
        }
        deviceId = devices[0].udid;
      }

      const device = new AndroidDevice(deviceId, sdkOptions);
      let agent: AndroidAgent | undefined = undefined;
      onTeardown(async () => {
        // The Agent owns its Device after construction; do not destroy it twice.
        if (agent) await agent.destroy();
        else await device.destroy();
      });
      await device.connect();
      signal.throwIfAborted();
      agent = new AndroidAgent(device, sdkOptions);
      signal.throwIfAborted();
      return { agent };
    },
  };
}
