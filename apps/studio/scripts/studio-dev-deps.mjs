import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const studioRendererDepsReadyFile = path.join(
  rootDir,
  '.studio-dev',
  'renderer-deps.ready',
);

export const initialBuildReadyPattern =
  /success\s+build complete,\s+watching for changes\.\.\./i;
