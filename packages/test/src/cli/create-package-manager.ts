export const createPackageManagers = ['npm', 'pnpm'] as const;
export type CreatePackageManager = (typeof createPackageManagers)[number];

export const packageManagerCommands: Record<
  CreatePackageManager,
  {
    install: string[];
    describe: string[];
    installChromium: string;
    verifyModel: string;
  }
> = {
  npm: {
    install: ['install', '--workspaces=false'],
    describe: [
      'exec',
      '--no',
      '--workspaces=false',
      '--',
      'midscene-test',
      'nodes',
    ],
    verifyModel: 'npm exec -- midscene-test model verify',
    installChromium: 'npm exec -- playwright install chromium',
  },
  pnpm: {
    install: ['install', '--ignore-workspace'],
    describe: ['exec', 'midscene-test', 'nodes'],
    verifyModel: 'pnpm exec midscene-test model verify',
    installChromium: 'pnpm exec playwright install chromium',
  },
};

export function detectPackageManager(userAgent?: string): CreatePackageManager {
  return userAgent?.startsWith('pnpm/') ? 'pnpm' : 'npm';
}
