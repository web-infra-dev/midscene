import { runModelCommand as runSharedModelCommand } from '@midscene/test/internal/model-command';
import { loadDotenvConfig } from './dotenv-loader';
import { runSiwcCommand } from './siwc-command';

export { buildModelVerifyCurlCommands } from '@midscene/test/internal/model-command';

export const runModelCommand: typeof runSharedModelCommand = (
  rawArgs,
  deps,
  io = { stdout: console.log, stderr: console.error },
) => {
  const [, action, ...restArgs] = rawArgs;
  if (action === 'siwc') {
    return runSiwcCommand(restArgs, io);
  }
  const withSiwcUsage = (message: string) =>
    message.replace(
      '  midscene model verify\n',
      '  midscene model verify\n  midscene model siwc <login|refresh> [options]\n',
    );
  return runSharedModelCommand(
    rawArgs,
    {
      loadDotenv: () =>
        loadDotenvConfig({
          dotenvDebug: true,
          dotenvOverride: true,
          log: io.stdout,
        }),
      ...deps,
    },
    {
      stdout: (message) => io.stdout(withSiwcUsage(message)),
      stderr: (message) => io.stderr(withSiwcUsage(message)),
    },
    'midscene',
  );
};
