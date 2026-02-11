import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { glob } from 'glob';

export function loadEnv(options?: {
  debug?: boolean;
  override?: boolean;
  verbose?: boolean;
}) {
  const envFile = join(process.cwd(), '.env');
  if (!existsSync(envFile)) return;
  if (options?.verbose) console.log(`   Env file: ${envFile}`);
  dotenv.config({
    path: envFile,
    debug: options?.debug,
    override: options?.override,
  });
}

// match yml or yaml files
export async function matchYamlFiles(
  fileGlob: string,
  options?: {
    cwd?: string;
  },
) {
  if (existsSync(fileGlob) && statSync(fileGlob).isDirectory()) {
    fileGlob = join(fileGlob, '**/*.{yml,yaml}');
  }

  const { cwd } = options || {};
  const ignore = ['**/node_modules/**'];
  const files = await glob(fileGlob, {
    nodir: true,
    windowsPathsNoEscape: true,
    absolute: true,
    ignore,
    cwd,
  });

  return files
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
}
