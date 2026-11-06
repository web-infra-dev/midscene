const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');

const [sourcePath, root, reportId, typescriptPath] = process.argv.slice(2);
const ts = require(typescriptPath);
// Load the production source in a separate process without requiring a build.
const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const sourceExports = {};
new Function('require', 'exports', output)(
  createRequire(sourcePath),
  sourceExports,
);
const store = new sourceExports.ReportArtifactStore(
  root,
  reportId,
  'agent',
  true,
);

process.once('message', async () => {
  try {
    for (const state of ['running', 'complete']) {
      await store.writeExecution(
        'step',
        JSON.stringify({ reportId, state }),
        {},
      );
    }
    await store.finalize();
    process.disconnect();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    process.disconnect();
  }
});
process.send('ready');
