import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformBinaryMap = {
  darwin: {
    directory: 'darwin',
    fileName: 'rdp-helper',
  },
  linux: {
    directory: 'linux',
    fileName: 'rdp-helper',
  },
  win32: {
    directory: 'win32',
    fileName: 'rdp-helper.exe',
  },
} as const;

type SupportedPlatform = keyof typeof platformBinaryMap;

function getPlatformBinary(platform: NodeJS.Platform) {
  if (platform in platformBinaryMap) {
    return platformBinaryMap[platform as SupportedPlatform];
  }

  return undefined;
}

function currentDirname(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  return dirname(fileURLToPath(import.meta.url));
}

export function getRdpHelperBinaryPath(): string {
  const platformBinary = getPlatformBinary(process.platform);
  if (!platformBinary) {
    throw new Error(
      `@midscene/computer RDP helper does not support platform ${process.platform}`,
    );
  }

  const hereDir = currentDirname();
  const candidateRoots = [
    resolve(hereDir, '../..'),
    resolve(hereDir, '../../..'),
  ];

  for (const root of candidateRoots) {
    const binaryPath = resolve(
      root,
      'bin',
      platformBinary.directory,
      platformBinary.fileName,
    );
    if (existsSync(binaryPath)) {
      return binaryPath;
    }
  }

  throw new Error(
    `RDP helper binary not found for ${process.platform}. Run \`pnpm --filter @midscene/computer run build:native\` first.`,
  );
}
