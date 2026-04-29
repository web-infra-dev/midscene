import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const shouldRunAiSmokeTest =
  process.env.MIDSCENE_STUDIO_RUN_STARTUP_SMOKE_AI === '1';
const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const reportReadyMarker = 'STUDIO_STARTUP_AI_REPORT_READY';

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

const describeAiStartupSmoke = shouldRunAiSmokeTest ? describe : describe.skip;

describeAiStartupSmoke('apps/studio Midscene startup smoke', () => {
  it('generates a Midscene report while validating the packaged Studio shell', async () => {
    const result = await runNodeScript('scripts/startup-smoke-ai.mjs', {
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
      timeoutMs: 180_000,
    });

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(`${result.stdout}\n${result.stderr}`).toContain(reportReadyMarker);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'studio-startup-ai-report.html',
    );
  }, 210_000);
});
