import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const repoRootDir = path.resolve(studioRootDir, '..', '..');
const reportFileName = 'studio-startup-ai-report.html';
const reportFilePath = path.join(
  repoRootDir,
  'midscene_run',
  'report',
  reportFileName,
);
const computerModuleUrl = pathToFileURL(
  path.resolve(repoRootDir, 'packages/computer/dist/es/index.mjs'),
).href;
const studioE2EReadyMarker = 'MIDSCENE_STUDIO_E2E_READY';
const reportReadyMarker = 'STUDIO_STARTUP_AI_REPORT_READY';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function waitForChildOutput(child, marker, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
    };

    const settle = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(marker)) {
        settle(resolve);
      }
    };

    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };

    const onExit = (code, signal) => {
      settle(() => {
        reject(
          new Error(
            `Studio exited before emitting ${marker}. code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    };

    const onError = (error) => {
      settle(() => reject(error));
    };

    const timeoutId = setTimeout(() => {
      settle(() => {
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for ${marker}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    }, timeoutMs);

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

async function terminateChildProcess(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeoutId);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

async function main() {
  rmSync(reportFilePath, { force: true });

  const baseEnv = {
    ...process.env,
    CI: process.env.CI ?? '1',
  };

  const syncResult = await runNodeScript('scripts/sync-static-assets.mjs', {
    env: baseEnv,
    timeoutMs: 30_000,
  });

  if (syncResult.code !== 0 || syncResult.signal !== null) {
    throw new Error(
      `Failed to sync Studio static assets before Midscene smoke\nstdout:\n${syncResult.stdout}\nstderr:\n${syncResult.stderr}`,
    );
  }

  let launchProcess = null;
  let agent = null;

  try {
    launchProcess = spawn(
      process.execPath,
      ['scripts/launch-electron-prod.mjs'],
      {
        cwd: studioRootDir,
        env: {
          ...baseEnv,
          MIDSCENE_STUDIO_E2E_TEST: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    await waitForChildOutput(launchProcess, studioE2EReadyMarker, 60_000);
    await sleep(2_000);

    const { agentFromComputer } = await import(computerModuleUrl);
    agent = await agentFromComputer({
      aiActionContext:
        'You are validating the Midscene Studio Electron desktop app. Focus only on the main Midscene Studio window. Ignore any terminal window, desktop wallpaper, or OS chrome outside the app.',
      autoPrintReportMsg: false,
      groupDescription:
        'Midscene-driven startup verification for the packaged Studio Electron app.',
      groupName: 'Studio startup AI smoke',
      reportFileName,
    });

    await agent.aiAssert(
      'A Midscene Studio desktop window is visible. It has a left sidebar with platform labels such as Android, iOS, Computer, HarmonyOS, or Web, and a right-side panel titled Playground.',
    );

    await agent.recordToReport('Studio shell became visible', {
      content:
        'Verified that the packaged Studio shell rendered the sidebar and Playground panel.',
    });

    await agent.aiAct(
      'Click the Settings button near the bottom-left of the Midscene Studio sidebar.',
    );
    await sleep(1_500);

    await agent.aiAssert(
      'A settings popup panel is visible and contains the items Language, Theme, GitHub, Website, and Environment.',
    );

    await agent.destroy();

    if (!agent.reportFile || !existsSync(agent.reportFile)) {
      throw new Error(
        `Studio startup AI report was not written to disk. Expected: ${reportFilePath}`,
      );
    }

    console.log(`${reportReadyMarker}:${agent.reportFile}`);
  } finally {
    if (agent) {
      try {
        await agent.destroy();
      } catch {
        // ignore teardown failures while surfacing the original error
      }
    }

    await terminateChildProcess(launchProcess, 10_000);
  }
}

try {
  await main();
} catch (error) {
  console.error('Studio startup AI smoke failed:', error);
  process.exit(1);
}
