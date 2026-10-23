import type { IOSDeviceOpt } from '@midscene/core/device';
import type { FileSetupContext } from '@midscene/core/internal/test-runner';
import type { IOSAgent, IOSAgentOpt } from '@midscene/ios';
import { assertWdaConnectionOptions } from './wda-options';

/** Uses the native WDA Device. Alternative device drivers require a custom setup. */
export type WdaIOSSetupOptions = IOSAgentOpt &
  Omit<IOSDeviceOpt, 'iOSDeviceClassOverride'>;

export interface IOSSetupContext {
  agent: IOSAgent;
}

function port(value: string | number, name: string): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return number;
}

function resolveOptions(
  options: WdaIOSSetupOptions,
  env: Readonly<NodeJS.ProcessEnv>,
): WdaIOSSetupOptions {
  const resolved = { ...options };
  // Explicit options replace the entire connection group, so an environment URL
  // cannot conflict with an explicitly selected host/port (or vice versa).
  if (
    options.wdaBaseUrl === undefined &&
    options.wdaHost === undefined &&
    options.wdaPort === undefined
  ) {
    if (env.WDA_BASE_URL) {
      if (env.WDA_HOST !== undefined || env.WDA_PORT !== undefined) {
        throw new Error(
          'WDA_BASE_URL cannot be used with WDA_HOST or WDA_PORT.',
        );
      }
      resolved.wdaBaseUrl = env.WDA_BASE_URL;
    } else {
      resolved.wdaHost = env.WDA_HOST || 'localhost';
      resolved.wdaPort = port(env.WDA_PORT || 8100, 'WDA_PORT');
    }
  }
  if (options.wdaMjpegUrl === undefined && options.wdaMjpegPort === undefined) {
    if (env.WDA_MJPEG_URL) {
      if (env.WDA_MJPEG_PORT !== undefined) {
        throw new Error('WDA_MJPEG_URL cannot be used with WDA_MJPEG_PORT.');
      }
      resolved.wdaMjpegUrl = env.WDA_MJPEG_URL;
    } else if (env.WDA_MJPEG_PORT !== undefined) {
      resolved.wdaMjpegPort = port(env.WDA_MJPEG_PORT, 'WDA_MJPEG_PORT');
    }
  }
  if (resolved.wdaPort !== undefined) port(resolved.wdaPort, 'wdaPort');
  if (resolved.wdaMjpegPort !== undefined)
    port(resolved.wdaMjpegPort, 'wdaMjpegPort');
  assertWdaConnectionOptions(resolved);
  return resolved;
}

/** Connects to an already available WDA service; it does not discover USB devices or deploy WDA. */
export function createWdaIOSSetup(options: WdaIOSSetupOptions = {}) {
  return {
    name: 'ios-wda',
    async setup({
      env,
      signal,
      onTeardown,
    }: Pick<
      FileSetupContext,
      'env' | 'signal' | 'onTeardown'
    >): Promise<IOSSetupContext> {
      signal.throwIfAborted();
      const sdkOptions = resolveOptions(options, env);
      const { IOSDevice, IOSAgent } = await import('@midscene/ios');
      signal.throwIfAborted();
      const device = new IOSDevice(sdkOptions);
      let agent: IOSAgent | undefined = undefined;
      onTeardown(async () => {
        if (agent) await agent.destroy();
        else await device.destroy();
      });
      await device.connect();
      signal.throwIfAborted();
      agent = new IOSAgent(device, sdkOptions);
      signal.throwIfAborted();
      return { agent };
    },
  };
}
