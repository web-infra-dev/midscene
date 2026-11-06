import { stripVTControlCharacters } from 'node:util';
import type { ConsoleLogEntry, ConsoleLogScope } from '@midscene/shared/logger';

const oneLine = (text: string): string =>
  stripVTControlCharacters(text).replace(/\s+/g, ' ').trim();

export function formatWarningScope(scope?: ConsoleLogScope): string {
  if (!scope) return '';
  const parts = [`[${oneLine(scope.projectName)}]`];
  if (scope.sourcePath) parts.push(oneLine(scope.sourcePath));
  if (scope.caseName) parts.push(oneLine(scope.caseName));
  if (scope.phase) {
    const phase = scope.phase === 'steps' ? 'step' : scope.phase;
    parts.push(
      `${phase}${scope.stepIndex === undefined ? '' : `[${scope.stepIndex + 1}]`}${scope.node ? ` ${oneLine(scope.node)}` : ''}`,
    );
  }
  return `${parts.join(' › ')} · `;
}

/** Prefer the underlying provider message, excluding stacks and response dumps. */
function errorMessage(error: unknown): string {
  const seen = new Set<unknown>();
  let current = error;
  let message = '';
  let status: number | undefined;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const detail = current as {
      message?: unknown;
      cause?: unknown;
      status?: unknown;
    };
    if (typeof detail.message === 'string') message = detail.message;
    if (typeof detail.status === 'number') status = detail.status;
    current = detail.cause;
  }
  const firstLine = oneLine((message || String(error)).split(/\r?\n/)[0]);
  return status && !firstLine.startsWith(String(status))
    ? `${status}: ${firstLine}`
    : firstLine;
}

export function formatWarning(entry: ConsoleLogEntry): string {
  const details = entry.warning;
  let message: string;
  if (details?.kind === 'model-request-retry') {
    message = `model request retry ${details.attempt + 1}/${details.maxAttempts} in ${details.delayMs / 1000}s (${oneLine(details.modelName)}): ${errorMessage(details.error)}`;
  } else {
    const error = entry.args?.find((arg) => arg instanceof Error);
    const prefix =
      typeof entry.args?.[0] === 'string'
        ? oneLine(entry.args[0].split(/\r?\n/)[0]).replace(/:\s*$/, '')
        : '';
    message = error
      ? `${prefix ? `${prefix}: ` : ''}${errorMessage(error)}`
      : oneLine(entry.message.split(/\r?\n/)[0]);
    message = message.replace(/^\[midscene:warning\]\s*/, '');
  }
  if (message.startsWith('waitForNetworkIdle is skipped for Playwright.'))
    message = 'Playwright: post-action network-idle wait skipped.';
  return message.length > 240 ? `${message.slice(0, 239)}…` : message;
}

export function warningKey(entry: ConsoleLogEntry, message: string): string {
  const details = entry.warning;
  if (details?.kind === 'model-request-retry')
    return `${entry.topic}\n${JSON.stringify(entry.scope)}\n${details.callId}\n${details.attempt}`;
  // Repeated compatibility notices are run-wide; errors retain their owner.
  const scope = entry.args?.some((arg) => arg instanceof Error)
    ? JSON.stringify(entry.scope)
    : '';
  return `${entry.topic}\n${scope}\n${message}`;
}
