import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getExponentialRetryDelayMs, retry } from './retry.mjs';

const runSdkManager = (args, input) =>
  new Promise((resolve, reject) => {
    const executable =
      process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager';
    const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
      .filter(Boolean)
      .flatMap((root) => [
        join(root, 'cmdline-tools', 'latest', 'bin', executable),
        join(root, 'tools', 'bin', executable),
      ]);
    const sdkManager =
      candidates.find((candidate) => existsSync(candidate)) ?? executable;
    const child = spawn(sdkManager, args, {
      stdio: [
        input ? 'pipe' : 'ignore',
        input ? 'ignore' : 'inherit',
        'inherit',
      ],
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`sdkmanager ${args.join(' ')} failed (${signal ?? code})`),
        );
    });
    if (input) {
      child.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE') reject(error);
      });
      child.stdin.end(input);
    }
  });

/** Retry SDK downloads without replaying emulator/model tests. */
export async function installAndroidSystemImage(
  image,
  {
    run = runSdkManager,
    wait,
    onRetry = ({ attempt, maxAttempts, error }) => {
      console.warn(
        `Android image download attempt ${attempt}/${maxAttempts} failed: ${error.message}`,
      );
    },
  } = {},
) {
  if (typeof image !== 'string' || !image.startsWith('system-images;'))
    throw new TypeError('An Android system-images package is required.');
  await run(['--licenses'], 'y\n'.repeat(100));
  await retry(() => run(['--install', image]), {
    maxAttempts: 3,
    getDelayMs: (attempt) => getExponentialRetryDelayMs(attempt, 5000),
    shouldRetry: (error) => error.code !== 'ENOENT',
    onRetry,
    ...(wait ? { wait } : {}),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await installAndroidSystemImage(process.argv[2]);
