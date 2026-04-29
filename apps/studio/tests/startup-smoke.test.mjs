import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const shouldRunSmokeTest =
  process.env.MIDSCENE_STUDIO_RUN_STARTUP_SMOKE === '1';
const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const smokeReadyMarker = 'MIDSCENE_STUDIO_SMOKE_READY';

function runNodeScript(scriptRelativePath, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptRelativePath], {
      cwd: studioRootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 1000).unref();

      settled = true;
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms running ${scriptRelativePath}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      clearTimeout(timeoutId);
      settled = true;
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (settled) {
        return;
      }

      clearTimeout(timeoutId);
      settled = true;
      resolve({ code, signal, stderr, stdout });
    });
  });
}

const describeStartupSmoke = shouldRunSmokeTest ? describe : describe.skip;

describeStartupSmoke('apps/studio startup smoke', () => {
  it('build artifacts can boot the Studio Electron shell and exit cleanly', async () => {
    const baseEnv = {
      ...process.env,
      CI: process.env.CI ?? '1',
    };

    const syncResult = await runNodeScript('scripts/sync-static-assets.mjs', {
      env: baseEnv,
      timeoutMs: 30_000,
    });

    expect(syncResult.code).toBe(0);
    expect(syncResult.signal).toBeNull();
    expect(syncResult.stderr).toBe('');
    expect(syncResult.stdout).toContain('Synced Midscene Studio static assets');

    const launchResult = await runNodeScript(
      'scripts/launch-electron-prod.mjs',
      {
        env: {
          ...baseEnv,
          MIDSCENE_STUDIO_SMOKE_TEST: '1',
        },
        timeoutMs: 60_000,
      },
    );

    expect(launchResult.code).toBe(0);
    expect(launchResult.signal).toBeNull();
    expect(`${launchResult.stdout}\n${launchResult.stderr}`).toContain(
      smokeReadyMarker,
    );
  }, 90_000);
});
