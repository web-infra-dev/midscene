#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory path of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Create extension directory
const extensionDir = path.resolve(__dirname, '../extension_output');
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir, {
    recursive: true,
  });
}

// Source directory - dist
const distDir = path.resolve(__dirname, '../dist');

// Create zip file
const version = packageJson.version;
const zipFileName = `midscene-extension-v${version}.zip`;
const zipFilePath = path.resolve(extensionDir, zipFileName);

// Delete existing zip file
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

// Directly package the contents of the dist directory into a zip file in the extension directory
try {
  execSync(`zip -r ${zipFilePath} .`, {
    cwd: distDir,
  });
  console.log(
    `Extension packed successfully: ${zipFileName} (saved in extension directory)`,
  );
} catch (error) {
  console.error('Error packing extension:', error);
}
