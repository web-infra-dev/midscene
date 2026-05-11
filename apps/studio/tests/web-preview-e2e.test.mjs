import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const shouldRunWebPreviewE2E =
  process.env.MIDSCENE_STUDIO_RUN_WEB_PREVIEW_E2E === '1';
const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const webPreviewReadyMarker = 'STUDIO_WEB_PREVIEW_E2E_READY';

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

const describeWebPreviewE2E = shouldRunWebPreviewE2E ? describe : describe.skip;

describeWebPreviewE2E('apps/studio Web preview e2e', () => {
  it('creates a Web agent, streams its preview, and exposes Action in the API menu', async () => {
    const result = await runNodeScript('scripts/web-preview-e2e.mjs', {
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
      timeoutMs: 180_000,
    });

    if (result.code !== 0) {
      throw new Error(
        `Studio Web preview e2e exited with code=${result.code} signal=${result.signal}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      webPreviewReadyMarker,
    );
  }, 210_000);
});
