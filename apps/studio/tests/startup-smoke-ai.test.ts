import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

const shouldRunAiSmokeTest =
  process.env.MIDSCENE_STUDIO_RUN_STARTUP_SMOKE_AI === '1';
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

type ComputerAgentLike = {
  aiAct(prompt: string): Promise<unknown>;
  aiAssert(prompt: string): Promise<unknown>;
  destroy(): Promise<void>;
  recordToReport(
    title?: string,
    opt?: {
      content: string;
    },
  ): Promise<void>;
  reportFile?: string | null;
};

vi.setConfig({
  testTimeout: 360 * 1000,
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runNodeScript(
  scriptRelativePath: string,
  { env, timeoutMs }: { env: NodeJS.ProcessEnv; timeoutMs: number },
) {
  return new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
  }>((resolve, reject) => {
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

function waitForChildOutput(
  child: ChildProcessWithoutNullStreams,
  marker: string,
  timeoutMs: number,
) {
  return new Promise<void>((resolve, reject) => {
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

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes(marker)) {
        settle(resolve);
      }
    };

    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        reject(
          new Error(
            `Studio exited before emitting ${marker}. code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    };

    const onError = (error: Error) => {
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

async function terminateChildProcess(
  child: ChildProcessWithoutNullStreams | null,
  timeoutMs: number,
) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
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

const describeAiStartupSmoke = shouldRunAiSmokeTest ? describe : describe.skip;

describeAiStartupSmoke('apps/studio Midscene startup smoke', () => {
  let agent: ComputerAgentLike | null = null;
  let launchProcess: ChildProcessWithoutNullStreams | null = null;

  beforeAll(async () => {
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

    const { agentFromComputer } = await import(
      /* @vite-ignore */ computerModuleUrl
    );
    agent = await agentFromComputer({
      aiActionContext:
        'You are validating the Midscene Studio Electron desktop app. Focus only on the main Midscene Studio window. Ignore any terminal window, desktop wallpaper, or OS chrome outside the app.',
      autoPrintReportMsg: false,
      groupDescription:
        'Midscene-driven startup verification for the packaged Studio Electron app.',
      groupName: 'Studio startup AI smoke',
      reportFileName,
    });
  });

  afterAll(async () => {
    try {
      if (agent) {
        await agent.destroy();
        if (agent.reportFile) {
          console.log(`Studio startup AI report: ${agent.reportFile}`);
        }
      }
    } finally {
      await terminateChildProcess(launchProcess, 10_000);
    }
  });

  it('launches the packaged Studio shell and verifies the UI with Midscene', async () => {
    if (!agent) {
      throw new Error('Studio startup AI smoke agent was not initialized.');
    }

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
  });
});
