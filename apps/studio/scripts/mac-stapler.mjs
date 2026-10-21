import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// stapler also exits with 68 for missing/invalid tickets. Only retry when
// Apple's diagnostics explicitly identify a transient network failure.
const transientNetworkError =
  /(?:NSURLErrorDomain|kCFErrorDomainCFNetwork)\s+Code=-(?:1001|1003|1004|1005|1006|1009)\b/;

const printOutput = ({ stdout, stderr }) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
};

export const runMacStapler = async (
  action,
  targetPath,
  { execute = execFileAsync, wait = delay } = {},
) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const output = await execute('xcrun', ['stapler', action, targetPath]);
      printOutput(output);
      return;
    } catch (error) {
      printOutput(error);
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
      if (attempt === maxAttempts || !transientNetworkError.test(output)) {
        throw error;
      }

      const delayMs = 5000 * 2 ** (attempt - 1);
      console.log(
        `stapler ${action} ${targetPath}: transient network failure (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs / 1000}s.`,
      );
      await wait(delayMs);
    }
  }
};
