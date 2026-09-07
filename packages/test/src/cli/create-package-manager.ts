export const createPackageManagers = ['npm', 'pnpm'] as const;
export type CreatePackageManager = (typeof createPackageManagers)[number];

export const packageManagerCommands: Record<
  CreatePackageManager,
  { install: string[]; describe: string[]; installChromium: string }
> = {
  npm: {
    install: ['install', '--workspaces=false'],
    describe: [
      'exec',
      '--no',
      '--workspaces=false',
      '--',
      'midscene-test',
      'describe-nodes',
    ],
    installChromium: 'npm exec -- playwright install chromium',
  },
  pnpm: {
    install: ['install', '--ignore-workspace'],
    describe: ['exec', 'midscene-test', 'describe-nodes'],
    installChromium: 'pnpm exec playwright install chromium',
  },
};

export function detectPackageManager(userAgent?: string): CreatePackageManager {
  return userAgent?.startsWith('pnpm/') ? 'pnpm' : 'npm';
}
