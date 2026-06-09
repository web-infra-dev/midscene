#!/usr/bin/env node
/**
 * Entry point for `pnpm --filter @midscene/testing-framework demo`.
 *
 * Boots the TypeScript demo through jiti (no build step needed) and aliases
 * the package name to src/ so the example authoring files resolve without a
 * dist build.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const here = dirname(fileURLToPath(import.meta.url));

const jiti = createJiti(import.meta.url, {
  alias: {
    '@midscene/testing-framework': join(here, '../src/index.ts'),
  },
});

const { main } = await jiti.import(join(here, 'demo/main.ts'));

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
