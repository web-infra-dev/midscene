export const VALID_PLATFORMS = ['web', 'computer', 'android', 'ios'] as const;
export type Platform = (typeof VALID_PLATFORMS)[number];

export function addGlobalOptions(yargs: import('yargs').Argv): import('yargs').Argv {
  return yargs
    .option('platform', {
      alias: 'p',
      choices: VALID_PLATFORMS as unknown as string[],
      default: 'web' as Platform,
      description: 'Execution platform',
    });
}
