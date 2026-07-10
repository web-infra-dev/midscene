import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_POWERSHELL_TIMEOUT_MS = 15_000;
const DEFAULT_POWERSHELL_MAX_BUFFER = 64 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export interface PowershellRunOptions {
  timeout?: number;
  maxBuffer?: number;
}

export function escapePowershellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function powershellArgs(script: string): string[] {
  // Non-interactive PowerShell sometimes writes progress CLIXML to stdout.
  const prefixed = `$ProgressPreference = 'SilentlyContinue'\n${script}`;
  const encoded = Buffer.from(prefixed, 'utf16le').toString('base64');
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}

function processOptions(options: PowershellRunOptions) {
  return {
    encoding: 'utf8' as const,
    timeout: options.timeout ?? DEFAULT_POWERSHELL_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? DEFAULT_POWERSHELL_MAX_BUFFER,
    windowsHide: true,
  };
}

/**
 * Execute an inline Windows PowerShell script without shell interpolation.
 * ExecutionPolicy is intentionally omitted because it does not gate inline
 * `-EncodedCommand` input.
 */
export function runPowershell(
  script: string,
  options: PowershellRunOptions = {},
): string {
  return execFileSync(
    'powershell.exe',
    powershellArgs(script),
    processOptions(options),
  );
}

export async function runPowershellAsync(
  script: string,
  options: PowershellRunOptions = {},
): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    powershellArgs(script),
    processOptions(options),
  );
  return stdout;
}
