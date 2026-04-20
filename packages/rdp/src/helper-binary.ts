import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function currentDirname(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  return dirname(fileURLToPath(import.meta.url));
}

export function getRdpHelperBinaryPath(): string {
  if (process.platform !== 'darwin') {
    throw new Error(
      `@midscene/rdp helper is currently only supported on darwin, got ${process.platform}`,
    );
  }

  const hereDir = currentDirname();
  const candidateRoots = [resolve(hereDir, '..'), resolve(hereDir, '../..')];

  for (const root of candidateRoots) {
    const binaryPath = resolve(root, 'bin/darwin/rdp-helper');
    if (existsSync(binaryPath)) {
      return binaryPath;
    }
  }

  throw new Error(
    'RDP helper binary not found. Run `pnpm --filter @midscene/rdp run build:native` first.',
  );
}
