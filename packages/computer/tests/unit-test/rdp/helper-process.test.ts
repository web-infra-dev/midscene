import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRdpHelperBinaryPath } from '../../../src/rdp/helper-binary';

// These tests exercise the *real* compiled rdp-helper binary over its stdio
// JSON protocol. They guard a regression where a malformed/partial request
// line made the helper's JSON parser throw an uncaught exception, aborting the
// whole process (SIGABRT) and tearing down the live RDP session. The helper
// must instead reject the bad line and keep serving subsequent requests.
//
// The binary is only present after `pnpm --filter @midscene/computer run
// build:native`, and starting it requires the FreeRDP shared libraries. When
// either is missing (e.g. a CI runner without the native toolchain) the suite
// skips itself rather than failing spuriously.

interface HelperRun {
  responses: Array<Record<string, any>>;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startError: boolean;
}

function resolveBinaryPath(): string | undefined {
  try {
    const path = getRdpHelperBinaryPath();
    return existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

// Feed the helper a sequence of raw stdin lines and collect one JSON response
// per line. Resolves once every line has a response (then closes stdin) or the
// process exits / a timeout fires.
function runHelper(
  binaryPath: string,
  lines: string[],
  timeoutMs = 8000,
): Promise<HelperRun> {
  return new Promise<HelperRun>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      resolve({
        responses: [],
        exitCode: null,
        signal: null,
        startError: true,
      });
      return;
    }

    const responses: Array<Record<string, any>> = [];
    let buffer = '';
    let settled = false;
    let stdinEnded = false;

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ responses, exitCode, signal, startError: false });
    };

    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard line split
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          responses.push(JSON.parse(line));
        } catch {
          // ignore non-JSON stdout noise
        }
        if (responses.length >= lines.length && !stdinEnded) {
          stdinEnded = true;
          child.stdin.end();
        }
      }
    });

    child.on('error', () => finish(null, null));
    child.on('exit', (code, signal) => finish(code, signal));

    for (const line of lines) {
      child.stdin.write(`${line}\n`);
    }
  });
}

describe('@midscene/computer rdp-helper process resilience', () => {
  const binaryPath = resolveBinaryPath();
  let runnable = false;

  beforeAll(async () => {
    if (!binaryPath) return;
    // Probe: can this environment actually start the binary and get a reply?
    const probe = await runHelper(binaryPath, [
      '{"id":"probe","payload":{"type":"size"}}',
    ]);
    runnable = !probe.startError && probe.responses.length > 0;
  });

  it.skipIf(!binaryPath)(
    'rejects a malformed request line and keeps serving instead of crashing',
    async () => {
      if (!runnable) {
        // Binary exists but cannot run here (missing FreeRDP libs, etc.).
        return;
      }

      const run = await runHelper(binaryPath!, [
        '{"id":"bad","payload":{not valid json',
        '{"id":"alive","payload":{"type":"size"}}',
      ]);

      // The process must exit cleanly on stdin EOF, never via an abort signal.
      expect(run.signal).toBeNull();
      expect(run.exitCode).toBe(0);

      // The malformed line is answered with an error, not silently dropped.
      const bad = run.responses.find((r) => r.id === 'bad');
      expect(bad).toBeDefined();
      expect(bad?.ok).toBe(false);
      expect(bad?.error?.code).toBe('invalid_request');

      // The helper is still alive afterwards and answers the next request,
      // proving one bad line does not tear the process down.
      const alive = run.responses.find((r) => r.id === 'alive');
      expect(alive).toBeDefined();
      expect(alive?.ok).toBe(false);
      expect(alive?.error?.code).toBe('not_connected');
    },
  );
});
