import type { ADB } from 'appium-adb';

type AdbShellFullOutput = {
  stdout?: unknown;
  stderr?: unknown;
};

type RunAdbShellOptions = {
  timeout?: number;
};

const EMPTY_ADB_SHELL_STDOUT = '<empty>';
const MAX_RUN_ADB_SHELL_STDOUT = 200;

function normalizeShellStream(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function truncateAdbShellStream(output: string, streamName: string): string {
  if (output.length <= MAX_RUN_ADB_SHELL_STDOUT) {
    return output;
  }

  return `${output.slice(0, MAX_RUN_ADB_SHELL_STDOUT)}
...[${streamName} truncated, ${output.length - MAX_RUN_ADB_SHELL_STDOUT} more characters]`;
}

export function buildRunAdbShellPlanningFeedback({
  command,
  stdout,
}: {
  command?: unknown;
  stdout: string;
}): string | undefined {
  if (stdout === '') {
    return undefined;
  }

  const commandText =
    typeof command === 'string' && command.length > 0
      ? `Command: ${command}\n`
      : '';

  return `RunAdbShell returned stdout. The stdout may indicate success or failure.
${commandText}Stdout:
${truncateAdbShellStream(stdout, 'stdout')}`;
}

function buildAdbShellStderrErrorMessage(
  command: string,
  stdout: string,
  stderr: string,
): string {
  return `RunAdbShell command returned stderr.
Command: ${command}
Stderr:
${truncateAdbShellStream(stderr, 'stderr')}
Stdout:
${stdout ? truncateAdbShellStream(stdout, 'stdout') : EMPTY_ADB_SHELL_STDOUT}`;
}

export function getAdbShellStdoutOrThrow(
  command: string,
  output: string | AdbShellFullOutput,
): string {
  if (typeof output === 'string') {
    return output;
  }

  const stdout = normalizeShellStream(output.stdout);
  const stderr = normalizeShellStream(output.stderr);

  if (stderr) {
    throw new Error(buildAdbShellStderrErrorMessage(command, stdout, stderr));
  }

  return stdout;
}

export async function runAdbShellStdoutOrThrow(
  adb: ADB,
  command: string,
  options: RunAdbShellOptions = {},
): Promise<string> {
  const output = (await adb.shell(command, {
    ...options,
    outputFormat: adb.EXEC_OUTPUT_FORMAT.FULL,
  } as any)) as string | AdbShellFullOutput;

  return getAdbShellStdoutOrThrow(command, output);
}
