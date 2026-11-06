import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getExponentialRetryDelayMs, retry } from '../../../scripts/retry.mjs';

const execFileAsync = promisify(execFile);
// stapler also exits with 68 for missing/invalid tickets. Only retry when
// Apple's diagnostics explicitly identify a transient network failure.
const transientNetworkError =
  /(?:NSURLErrorDomain|kCFErrorDomainCFNetwork)\s+Code=-(?:1001|1003|1004|1005|1006|1009)\b/;

export const isTransientMacNetworkError = (output) =>
  transientNetworkError.test(output);

const printOutput = ({ stdout, stderr }) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
};

export const runMacStapler = async (
  action,
  targetPath,
  { execute = execFileAsync, wait } = {},
) => {
  await retry(
    async () => {
      try {
        printOutput(await execute('xcrun', ['stapler', action, targetPath]));
      } catch (error) {
        printOutput(error);
        throw error;
      }
    },
    {
      maxAttempts: 3,
      getDelayMs: (attempt) => getExponentialRetryDelayMs(attempt, 5000),
      shouldRetry: (error) =>
        isTransientMacNetworkError(
          `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
        ),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.log(
          `stapler ${action} ${targetPath}: transient network failure (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs / 1000}s.`,
        );
      },
      wait,
    },
  );
};
