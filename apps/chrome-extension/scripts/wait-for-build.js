#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.resolve(__dirname, '../dist/manifest.json');
const indexHtmlPath = path.resolve(__dirname, '../dist/index.html');
const maxWaitTime = 60000; // 60 seconds
const checkInterval = 500; // 500ms
const stabilityWait = 1000; // Wait 1 second after detection to ensure files are stable

let elapsed = 0;

console.log('Waiting for initial build to complete...');

const checkBuildComplete = () => {
  const manifestExists = fs.existsSync(manifestPath);
  const indexExists = fs.existsSync(indexHtmlPath);

  if (manifestExists && indexExists) {
    // Wait a bit more to ensure all files are written
    console.log('Build files detected, waiting for stability...');
    setTimeout(() => {
      // Double check the files still exist
      if (fs.existsSync(manifestPath) && fs.existsSync(indexHtmlPath)) {
        console.log('Build complete! Starting web-ext...');
        process.exit(0);
      } else {
        console.log('Build files disappeared, continuing to wait...');
        setTimeout(checkBuildComplete, checkInterval);
      }
    }, stabilityWait);
    return;
  }

  elapsed += checkInterval;

  if (elapsed >= maxWaitTime) {
    console.error('Timeout waiting for build to complete');
    process.exit(1);
  }

  setTimeout(checkBuildComplete, checkInterval);
};

checkBuildComplete();
