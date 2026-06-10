/**
 * Classic @no-ai callbacks for the real-cucumber fixture. Imported by the
 * cucumber process via the profile's `features/step_definitions/**\/*.js`
 * glob; registers into @midscene/bdd's no-ai registry (NOT cucumber's own —
 * the catch-all in @midscene/bdd/register is the only cucumber definition).
 *
 * The marker write goes straight to the shared cross-process JSONL log so
 * the vitest side can prove this callback actually ran in the child process.
 */
const { appendFileSync } = require('node:fs');
const { defineStep } = require('@midscene/bdd');

defineStep('the marker step writes {string}', async (value) => {
  appendFileSync(
    process.env.BDD_STUB_LOG,
    `${JSON.stringify(['no-ai-marker', value])}\n`,
  );
});
