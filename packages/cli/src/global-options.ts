export const VALID_PLATFORMS = ['web', 'computer', 'android', 'ios'] as const;
export type Platform = (typeof VALID_PLATFORMS)[number];

export interface GlobalOptions {
  platform: Platform;
  target?: string;
  timeout?: number;
  log?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  json: boolean;
  noAutoConnect: boolean;
}

export function addGlobalOptions(yargs: import('yargs').Argv): import('yargs').Argv {
  return yargs
    .option('platform', {
      alias: 'p',
      choices: VALID_PLATFORMS as unknown as string[],
      default: 'web' as Platform,
      description: 'Execution platform',
    })
    .option('target', {
      alias: 't',
      type: 'string',
      description: 'Use a named target profile from config',
    })
    .option('timeout', {
      type: 'number',
      description: 'Override default timeout (ms)',
    })
    .option('log', {
      choices: ['trace', 'debug', 'info', 'warn', 'error'] as const,
      description: 'Log level',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      description: 'Machine-readable JSON output',
    })
    .option('auto-connect', {
      type: 'boolean',
      default: true,
      description: 'Auto-launch session if none exists (use --no-auto-connect to disable)',
    });
}

export function resolveGlobalOptions(argv: Record<string, unknown>): GlobalOptions {
  return {
    platform: (argv.platform as Platform) ?? 'web',
    target: argv.target as string | undefined,
    timeout: argv.timeout as number | undefined,
    log: argv.log as GlobalOptions['log'],
    json: (argv.json as boolean) ?? false,
    noAutoConnect: argv.autoConnect === false || (argv.noAutoConnect as boolean) === true,
  };
}
