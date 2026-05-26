import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { createYamlCaseFailure } from './yaml-case';
import type { RunYamlCaseOptions, RunYamlCaseResult } from './yaml-case';

export interface RunYamlCaseInChildProcessOptions extends RunYamlCaseOptions {
  frameworkImport?: string;
  cwd?: string;
  resultFile?: string;
  timeout?: number;
  stdio?: 'inherit' | 'pipe';
}

interface ChildMessage {
  type?: 'result' | 'error';
  result?: MidsceneYamlConfigResult;
  error?: {
    message?: string;
    stack?: string;
  };
}

const childRunnerScript = `
const options = JSON.parse(process.env.MIDSCENE_YAML_CASE_OPTIONS || '{}');
const frameworkImport = process.env.MIDSCENE_FRAMEWORK_IMPORT;

const sendMessage = (message) => new Promise((resolve) => {
  if (!process.send) {
    resolve();
    return;
  }
  process.send(message, () => resolve());
});

(async () => {
  if (!frameworkImport) {
    throw new Error('MIDSCENE_FRAMEWORK_IMPORT is required');
  }
  const framework = await import(frameworkImport);
  const runYamlCaseResult =
    framework.runYamlCaseResult ||
    framework.default?.runYamlCaseResult;
  const runYamlCase = framework.runYamlCase || framework.default?.runYamlCase;
  if (typeof runYamlCaseResult === 'function') {
    const result = await runYamlCaseResult(options);
    await sendMessage({ type: 'result', result });
    if (!result.success) {
      throw new Error(result.error || 'YAML case failed');
    }
    return;
  }
  if (typeof runYamlCase !== 'function') {
    throw new Error('Cannot find runYamlCaseResult or runYamlCase from Midscene framework entry');
  }
  const result = await runYamlCase(options);
  await sendMessage({
    type: 'result',
    result: {
      file: result.file,
      success: true,
      executed: true,
      output: result.output,
      report: result.report,
      duration: result.duration,
      resultType: 'success'
    }
  });
})().catch((error) => {
  const message = error?.message || String(error);
  const stack = error?.stack || message;
  process.send?.({ type: 'error', error: { message, stack } });
  console.error(stack);
  process.exit(1);
});
`;

const formatChildFailure = (details: {
  file: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: ChildMessage['error'];
  stderr: string;
}): Error => {
  const status = details.signal
    ? `signal ${details.signal}`
    : `exit code ${details.code ?? 1}`;
  const message =
    details.error?.message ||
    details.stderr.trim() ||
    `YAML case failed with ${status}`;
  const suffix = details.error?.stack || details.stderr.trim();
  return new Error(
    `YAML case failed: ${details.file}\n${message}${
      suffix && suffix !== message ? `\n${suffix}` : ''
    }`,
  );
};

const writeResultFile = (resultFile: string | undefined, data: unknown) => {
  if (!resultFile) {
    return;
  }
  mkdirSync(dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(data, null, 2));
};

export async function runYamlCaseInChildProcess(
  options: RunYamlCaseInChildProcessOptions,
): Promise<RunYamlCaseResult> {
  const {
    cwd,
    frameworkImport = '@midscene/cli/dist/lib/framework/index.js',
    resultFile,
    stdio = 'inherit',
    timeout,
    ...runOptions
  } = options;
  const file = resolve(runOptions.file);
  const childOptions: RunYamlCaseOptions = {
    ...runOptions,
    file,
  };
  const startTime = Date.now();

  return new Promise((resolvePromise, reject) => {
    let stdout = '';
    let stderr = '';
    let result: MidsceneYamlConfigResult | undefined;
    let childError: ChildMessage['error'];
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const child = spawn(process.execPath, ['-e', childRunnerScript], {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        MIDSCENE_FRAMEWORK_IMPORT: frameworkImport,
        MIDSCENE_YAML_CASE_OPTIONS: JSON.stringify(childOptions),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    if (timeout) {
      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGTERM');
        cleanup();
        reject(new Error(`YAML case timed out after ${timeout}ms: ${file}`));
      }, timeout);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdio === 'inherit') {
        process.stdout.write(chunk);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stdio === 'inherit') {
        process.stderr.write(chunk);
      }
    });

    child.on('message', (message: ChildMessage) => {
      if (message?.type === 'result') {
        result = message.result;
      }
      if (message?.type === 'error') {
        childError = message.error;
      }
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      if (code === 0 && !signal) {
        const successResult: MidsceneYamlConfigResult = result || {
          file,
          success: true,
          executed: true,
          duration: Date.now() - startTime,
          resultType: 'success',
        };
        writeResultFile(resultFile, successResult);
        resolvePromise({
          file: successResult.file,
          output: successResult.output || undefined,
          report: successResult.report,
          duration: successResult.duration || 0,
        });
        return;
      }

      const failure = formatChildFailure({
        file,
        code,
        signal,
        error: childError,
        stderr: stderr || stdout,
      });
      const failedResult = result || {
        file,
        success: false,
        executed: true,
        output: undefined,
        report: undefined,
        duration: Date.now() - startTime,
        resultType: 'failed',
        error: childError?.message || failure.message,
      };
      writeResultFile(resultFile, failedResult);
      reject(result ? createYamlCaseFailure(result) : failure);
    });
  });
}
