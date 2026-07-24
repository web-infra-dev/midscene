import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionReloadSignalPath = path.join(
  tmpdir(),
  'midscene-chrome-extension-reload',
);

await rm(extensionReloadSignalPath, { force: true });
