/**
 * Classic @no-ai callbacks for the ESM fixture. This file is ESM (the
 * fixture's package.json declares "type": "module"), so `import` resolves
 * '@midscene/bdd' to dist/es/index.mjs — a DIFFERENT module instance from
 * the dist/lib CJS copy cucumber loads via the register entry. The H1
 * regression test proves both instances share one no-ai registry.
 */
import { appendFileSync } from 'node:fs';
import { defineStep } from '@midscene/bdd';

defineStep('the esm marker step writes {string}', async (value) => {
  appendFileSync(
    process.env.BDD_STUB_LOG,
    `${JSON.stringify(['no-ai-marker-esm', value])}\n`,
  );
});
