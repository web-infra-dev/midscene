import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { version } from '../../package.json';
import {
  type CreatePackageManager,
  packageManagerCommands,
} from './create-package-manager';
import { loadTemplateManifest, renderTemplate } from './template-renderer';

export const createPlatforms = [
  'web',
  'android',
  'ios',
  'harmony',
  'computer',
] as const;
export type CreatePlatform = (typeof createPlatforms)[number];

export const createPlatformLabels: Record<CreatePlatform, string> = {
  web: 'Web (Playwright)',
  android: 'Android',
  ios: 'iOS',
  harmony: 'HarmonyOS',
  computer: 'Desktop (Computer)',
};

function catalogRoot(): string {
  // Source checkout and packed CLI are both two directories below the package root.
  const packageRoot = resolve(__dirname, '../..');
  const source = resolve(packageRoot, '../../examples/catalog');
  if (existsSync(source)) return source;
  const packed = resolve(packageRoot, 'dist/templates');
  if (existsSync(packed)) return packed;
  throw new Error(
    'Midscene Test templates are missing from this installation.',
  );
}

export function createProjectFiles(
  name: string,
  platform: CreatePlatform,
  packageManager: CreatePackageManager,
): Record<string, Buffer> {
  const root = catalogRoot();
  const entries = loadTemplateManifest(root).templates.filter(
    (entry) => entry.exposure === 'create' && entry.platform === platform,
  );
  if (entries.length !== 1) {
    throw new Error(`Expected one create template for platform ${platform}.`);
  }
  const commands = packageManagerCommands[packageManager];
  return renderTemplate(root, entries[0], {
    PROJECT_NAME: name,
    MIDSCENE_VERSION: version,
    INSTALL_COMMAND: `${packageManager} ${commands.install.join(' ')}`,
    RUN_NODES_COMMAND: `${packageManager} run nodes`,
    TEST_COMMAND: `${packageManager} test`,
    CHROMIUM_INSTALL_COMMAND: commands.installChromium,
  });
}
