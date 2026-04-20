import { createRequire } from 'node:module';
import path from 'node:path';
import {
  ScrcpyServer,
  androidPlaygroundPlatform,
} from '@midscene/android-playground';
import {
  type LaunchPlaygroundResult,
  launchPreparedPlaygroundPlatform,
} from '@midscene/playground';
import type { AndroidPlaygroundBootstrap } from '@shared/electron-contract';
import { createStudioCorsOptions } from './cors';
import type {
  AndroidPlaygroundPackagePaths,
  AndroidPlaygroundRuntimeService,
} from './types';

const require = createRequire(__filename);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown Android runtime error';
}

export function resolveAndroidPlaygroundPackagePaths(): AndroidPlaygroundPackagePaths {
  const packageJsonPath = require.resolve(
    '@midscene/android-playground/package.json',
  );
  const packageRoot = path.dirname(packageJsonPath);

  return {
    packageRoot,
    staticDir: path.join(packageRoot, 'static'),
  };
}

export function createAndroidPlaygroundRuntimeService(): AndroidPlaygroundRuntimeService {
  let bootstrap: AndroidPlaygroundBootstrap = {
    status: 'starting',
    serverUrl: null,
    port: null,
    error: null,
  };
  let launchResult: LaunchPlaygroundResult | null = null;
  let startPromise: Promise<AndroidPlaygroundBootstrap> | null = null;

  const close = async () => {
    if (!launchResult) {
      return;
    }

    const activeLaunch = launchResult;
    launchResult = null;
    await activeLaunch.close();
  };

  const start = async (): Promise<AndroidPlaygroundBootstrap> => {
    if (launchResult) {
      return bootstrap;
    }

    if (startPromise) {
      return startPromise;
    }

    bootstrap = {
      status: 'starting',
      serverUrl: null,
      port: null,
      error: null,
    };

    startPromise = (async () => {
      try {
        const { staticDir } = resolveAndroidPlaygroundPackagePaths();
        const scrcpyServer = new ScrcpyServer();
        const prepared = await androidPlaygroundPlatform.prepare({
          staticDir,
          scrcpyServer,
        });
        const nextLaunchResult = await launchPreparedPlaygroundPlatform(
          prepared,
          {
            corsOptions: createStudioCorsOptions(),
            enableCors: true,
            openBrowser: false,
            verbose: false,
          },
        );

        launchResult = nextLaunchResult;
        bootstrap = {
          status: 'ready',
          serverUrl: `http://${nextLaunchResult.host}:${nextLaunchResult.port}`,
          port: nextLaunchResult.port,
          error: null,
        };

        return bootstrap;
      } catch (error) {
        bootstrap = {
          status: 'error',
          serverUrl: null,
          port: null,
          error: getErrorMessage(error),
        };

        return bootstrap;
      } finally {
        startPromise = null;
      }
    })();

    return startPromise;
  };

  return {
    close,
    getBootstrap: () => bootstrap,
    restart: async () => {
      await close();
      return start();
    },
    start,
  };
}
