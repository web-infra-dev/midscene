import { runModelCommand as runSharedModelCommand } from '@midscene/test/internal/model-command';
import { loadDotenvConfig } from './dotenv-loader';

export { buildModelVerifyCurlCommands } from '@midscene/test/internal/model-command';

export const runModelCommand: typeof runSharedModelCommand = (
  rawArgs,
  deps,
  io = { stdout: console.log, stderr: console.error },
) =>
  runSharedModelCommand(
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
    io,
    'midscene',
  );
