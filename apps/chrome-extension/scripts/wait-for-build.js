#!/usr/bin/env node

import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionReloadSignalPath = path.join(
  tmpdir(),
  'midscene-chrome-extension-reload',
);
const maxWaitTime = 180000;
const checkInterval = 100;
let elapsed = 0;

console.log('Waiting for the first complete extension build...');

const waitForBuildSignal = () => {
  if (fs.existsSync(extensionReloadSignalPath)) {
    console.log('Build complete! Starting web-ext...');
    process.exit(0);
  }

  elapsed += checkInterval;
  if (elapsed >= maxWaitTime) {
    console.error('Timeout waiting for build completion signal');
    process.exit(1);
  }

  setTimeout(waitForBuildSignal, checkInterval);
};

waitForBuildSignal();
