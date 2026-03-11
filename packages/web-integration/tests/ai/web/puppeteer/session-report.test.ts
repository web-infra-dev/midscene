import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');
const RUNNER_PATH = path.join(__dirname, 'session-command-runner.ts');
const TSX_PACKAGE_JSON_PATH = require.resolve('tsx/package.json', {
  paths: [path.join(REPO_ROOT, 'packages/web-integration')],
});
const TSX_CLI_PATH = path.join(
  path.dirname(TSX_PACKAGE_JSON_PATH),
  'dist/cli.mjs',
);
const FIXTURE_FILE = 'session-report.html';
const FIRST_PROMPT = 'type session-report-merge in the Name input field';
const SECOND_PROMPT = 'click the Complete Flow button';
const ENV_FILE_PATH = path.join(REPO_ROOT, '.env');
const VISION_MODE_ENV_KEYS = [
  'MIDSCENE_USE_DOUBAO_VISION',
  'MIDSCENE_USE_QWEN_VL',
  'MIDSCENE_USE_QWEN3_VL',
  'MIDSCENE_USE_VLM_UI_TARS',
  'MIDSCENE_USE_GEMINI',
] as const;
const ENV_FILE_VALUES = existsSync(ENV_FILE_PATH)
  ? dotenv.parse(readFileSync(ENV_FILE_PATH, 'utf-8'))
  : {};

interface SessionCommandResult {
  isError: boolean;
  text: string[];
  imageCount: number;
}

interface SessionCommandOutput {
  result: SessionCommandResult;
  stdout: string;
  stderr: string;
}

dotenv.config({
  path: ENV_FILE_PATH,
});

vi.setConfig({
  testTimeout: 180 * 1000,
});

function createFixtureServer(fileName: string): Promise<{
  server: Server;
  url: string;
}> {
  const fixturePath = path.join(FIXTURES_DIR, fileName);

  const server = createServer((request, response) => {
    const requestPath = (request.url || '/').split('?')[0];

    if (requestPath === '/favicon.ico') {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (requestPath !== '/' && requestPath !== `/${fileName}`) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(readFileSync(fixturePath, 'utf-8'));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine fixture server address'));
        return;
      }
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/${fileName}`,
      });
    });
  });
}

async function closeServer(server?: Server): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function buildCliArgs(args: Record<string, string>): string[] {
  return Object.entries(args).flatMap(([key, value]) => [`--${key}`, value]);
}

function extractMarkedJson(
  stdout: string,
  prefix: string,
): SessionCommandResult {
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].startsWith(prefix)) {
      return JSON.parse(lines[index].slice(prefix.length));
    }
  }

  throw new Error(`Missing ${prefix} marker in output:\n${stdout}`);
}

async function runSessionCommand(
  command: string,
  args: Record<string, string> = {},
): Promise<SessionCommandOutput> {
  const childEnv = {
    ...process.env,
    MIDSCENE_REPORT_QUIET: '1',
  };
  const preferredVisionMode =
    VISION_MODE_ENV_KEYS.find((key) => ENV_FILE_VALUES[key]) ||
    VISION_MODE_ENV_KEYS.find((key) => childEnv[key]);

  if (preferredVisionMode) {
    for (const key of VISION_MODE_ENV_KEYS) {
      childEnv[key] = key === preferredVisionMode ? childEnv[key] || '1' : '';
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [TSX_CLI_PATH, RUNNER_PATH, command, ...buildCliArgs(args)],
      {
        cwd: REPO_ROOT,
        env: childEnv,
        timeout: 120 * 1000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      result: extractMarkedJson(stdout, '__RESULT__'),
      stdout,
      stderr,
    };
  } catch (error: unknown) {
    const stdout =
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string'
        ? error.stdout
        : '';
    const stderr =
      error &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr
        : '';
    const output = [stdout, stderr].filter(Boolean).join('\n');
    throw new Error(
      `Command failed: ${command}\n${
        output || (error instanceof Error ? error.message : String(error))
      }`,
    );
  }
}

describe('session merged report e2e', () => {
  let server: Server | undefined;
  let reportReset: (() => Promise<void>) | undefined;
  let sessionDir: string | undefined;

  afterEach(async () => {
    if (reportReset) {
      await reportReset();
      reportReset = undefined;
    }

    await closeServer(server);
    server = undefined;

    try {
      await runSessionCommand('close');
    } catch {
      // Ignore cleanup failures for stale or already-closed sessions.
    }

    if (sessionDir) {
      rmSync(sessionDir, { recursive: true, force: true });
      sessionDir = undefined;
    }
  });

  it('merges multiple session acts into one exported report and renders both executions', async () => {
    const sessionId = `session-report-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    sessionDir = path.join(REPO_ROOT, 'midscene_run', 'session', sessionId);
    rmSync(sessionDir, { recursive: true, force: true });

    const fixtureServer = await createFixtureServer(FIXTURE_FILE);
    server = fixtureServer.server;

    const connectResult = await runSessionCommand('connect', {
      url: fixtureServer.url,
      sessionId,
    });
    expect(connectResult.result.isError).toBe(false);

    const firstActResult = await runSessionCommand('act', {
      prompt: FIRST_PROMPT,
      sessionId,
    });
    expect(firstActResult.result.isError).toBe(false);
    expect(firstActResult.result.text.join('\n')).toContain('Action "act"');

    const secondActResult = await runSessionCommand('act', {
      prompt: SECOND_PROMPT,
      sessionId,
    });
    expect(secondActResult.result.isError).toBe(false);
    expect(secondActResult.result.text.join('\n')).toContain('Action "act"');

    const exportResult = await runSessionCommand('export_session_report', {
      sessionId,
    });
    expect(exportResult.result.isError).toBe(false);

    const sessionFilePath = path.join(sessionDir, 'session.json');
    expect(existsSync(sessionFilePath)).toBe(true);

    const sessionState = JSON.parse(readFileSync(sessionFilePath, 'utf-8')) as {
      executionCount: number;
      groupName: string;
      reportFilePath?: string;
    };

    expect(sessionState.executionCount).toBe(2);
    expect(sessionState.reportFilePath).toBeTruthy();
    expect(existsSync(sessionState.reportFilePath!)).toBe(true);

    const firstExecutionName = `Act - ${FIRST_PROMPT}`;
    const secondExecutionName = `Act - ${SECOND_PROMPT}`;

    const { originPage, reset } = await launchPage(
      `file://${sessionState.reportFilePath}`,
    );
    reportReset = reset;

    await originPage.waitForFunction(
      ([firstName, secondName]) => {
        const executionTitles = Array.from(
          document.querySelectorAll('.side-sub-title'),
        ).map((element) => element.textContent || '');

        return (
          executionTitles.some((title) => title.includes(firstName)) &&
          executionTitles.some((title) => title.includes(secondName))
        );
      },
      { timeout: 30 * 1000 },
      [firstExecutionName, secondExecutionName],
    );

    const reportState = await originPage.evaluate(
      ([groupName, firstName, secondName]) => {
        const executionTitles = Array.from(
          document.querySelectorAll('.side-sub-title'),
        ).map((element) => element.textContent || '');
        const dumpScript = Array.from(document.querySelectorAll('script')).find(
          (script) => {
            const content = script.textContent || '';
            return (
              content.includes(groupName) &&
              content.includes(firstName) &&
              content.includes(secondName)
            );
          },
        );

        const dump = dumpScript
          ? JSON.parse(dumpScript.textContent || '{}')
          : null;

        return {
          executionTitles,
          groupName: dump?.groupName || null,
          executionCount: Array.isArray(dump?.executions)
            ? dump.executions.length
            : 0,
        };
      },
      [sessionState.groupName, firstExecutionName, secondExecutionName],
    );

    expect(reportState.groupName).toBe(sessionState.groupName);
    expect(reportState.executionCount).toBe(2);
    expect(reportState.executionTitles).toContain(firstExecutionName);
    expect(reportState.executionTitles).toContain(secondExecutionName);
  });
});
