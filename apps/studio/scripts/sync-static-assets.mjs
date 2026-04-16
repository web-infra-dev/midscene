import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const defaultSourceDir = path.join(rootDir, 'assets');
export const defaultTargetDir = path.join(rootDir, 'dist/assets');

/**
 * Copy the shell's static assets into the build output, wiping any prior
 * target contents first so files removed from source do not linger in dist.
 * Throws if `sourceDir` does not exist — there is no meaningful fallback
 * when the asset bundle is missing.
 */
export const syncStaticAssets = async ({
  sourceDir = defaultSourceDir,
  targetDir = defaultTargetDir,
} = {}) => {
  await fs.access(sourceDir);
  await fs.rm(targetDir, { force: true, recursive: true });
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
  return targetDir;
};

const isDirectInvocation =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  const targetDir = await syncStaticAssets();
  console.log(`Synced Midscene Studio static assets to ${targetDir}`);
}
