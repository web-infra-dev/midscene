#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

// Get the directory path of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const packageJsonPath = path.resolve(
  __dirname,
  '../../../packages/core/package.json',
);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Validate version string to prevent injection
const version = packageJson.version;
// if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.]+)?$/.test(version)) {
//   console.error('Invalid version format in package.json');
//   process.exit(1);
// }

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
const zipFileName = `midscene-extension-v${version}.zip`;
const zipFilePath = path.resolve(extensionDir, zipFileName);

// Delete existing zip file
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

// Create a file to stream archive data to
const output = fs.createWriteStream(zipFilePath);
const archive = archiver('zip', {
  zlib: {
    level: 9,
  }, // Sets the compression level
});

// Listen for all archive data to be written
output.on('close', () => {
  console.log(
    `Extension packed successfully: ${zipFileName} (${archive.pointer()} total bytes saved in extension directory)`,
  );
});

// Handle warnings and errors
archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('Warning during archiving:', err);
  } else {
    console.error('Error during archiving:', err);
    process.exit(1);
  }
});

archive.on('error', (err) => {
  console.error('Error during archiving:', err);
  process.exit(1);
});

// Pipe archive data to the file
archive.pipe(output);

// Append files from dist directory, putting files at the root of archive
archive.directory(distDir, false);

// Finalize the archive (i.e. we are done appending files but streams have to finish yet)
archive.finalize();
