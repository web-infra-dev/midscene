import { runModelCommand as runSharedModelCommand } from '@midscene/test/internal/model-command';
import { loadDotenvConfig } from './dotenv-loader';
import { runSiwcCommand } from './siwc-command';

export { buildModelVerifyCurlCommands } from '@midscene/test/internal/model-command';

export async function runModelCommand(
  rawArgs: string[],
  deps?: Parameters<typeof runSharedModelCommand>[1],
  io: NonNullable<Parameters<typeof runSharedModelCommand>[2]> = {
    stdout: console.log,
    stderr: console.error,
  },
): Promise<number | undefined> {
  const [, action, ...restArgs] = rawArgs;
  if (action === 'benchmark-grounding') {
    const { main } = await import('./benchmark-grounding');
    return main(restArgs);
  }
  if (action === 'siwc') {
    loadDotenvConfig({ dotenvOverride: false, dotenvDebug: false });
    return runSiwcCommand(restArgs, io);
  }
  const withModelUsage = (message: string) =>
    message.replace(
      '  midscene model verify\n',
      '  midscene model verify\n  midscene model siwc <login|refresh> [options]\n  midscene model benchmark-grounding <prepare|viewer|run|report|merge> [options]\n',
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
      stdout: (message) => io.stdout(withModelUsage(message)),
      stderr: (message) => io.stderr(withModelUsage(message)),
    },
    'midscene',
  );
}
