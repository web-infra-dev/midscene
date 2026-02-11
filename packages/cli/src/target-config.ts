import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { Platform } from './global-options';

export interface TargetProfile {
  platform?: Platform;
  url?: string;
  bridge?: boolean;
  device?: string;
  display?: string;
}

interface TargetConfigFile {
  targets?: Record<string, TargetProfile>;
}

const CONFIG_FILENAMES = ['midscene.config.yaml', '.midscenerc.yaml'];

function findConfigFile(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveTargetProfile(targetName: string): TargetProfile {
  const configPath = findConfigFile(process.cwd());
  if (!configPath) {
    throw new Error(`No config file found (midscene.config.yaml or .midscenerc.yaml). Cannot resolve target "${targetName}".`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = yamlLoad(content) as TargetConfigFile;

  if (!config?.targets?.[targetName]) {
    const available = config?.targets ? Object.keys(config.targets).join(', ') : 'none';
    throw new Error(`Target "${targetName}" not found in ${configPath}. Available targets: ${available}`);
  }

  return config.targets[targetName];
}
