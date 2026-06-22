import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Load workspace-root `.env` into `process.env` from a globalSetup hook.
 *
 * Why globalSetup and not the config file top-level: rstest runs config files
 * in the CLI process but spawns test files in separate worker forks. Mutating
 * `process.env` from `rstest.config.ts` does not propagate to those workers.
 * Rstest snapshots `process.env` *after* globalSetup runs and seeds it into
 * every worker (see https://rstest.rs/config/test/global-setup.md). Putting
 * dotenv.config() here makes the workspace `.env` visible to every test.
 */
export default function setup() {
  dotenv.config({
    path: path.resolve(__dirname, '..', '.env'),
    override: true,
  });
}
