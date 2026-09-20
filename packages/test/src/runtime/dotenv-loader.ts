import { existsSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';

export interface DotenvLoadOptions {
  dotenvOverride?: boolean;
  dotenvDebug?: boolean;
  cwd?: string;
  log?: (message: string) => void;
}

export function loadDotenvConfig(options: DotenvLoadOptions = {}) {
  const dotEnvConfigFile = join(options.cwd ?? process.cwd(), '.env');
  if (!existsSync(dotEnvConfigFile)) {
    return;
  }

  options.log?.(`   Env file: ${dotEnvConfigFile}`);
  dotenv.config({
    path: dotEnvConfigFile,
    debug: options.dotenvDebug,
    override: options.dotenvOverride,
  });
}
