#!/usr/bin/env node

import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../idb/auto_server.py');

const port = process.argv[2] || '1412';

console.log(`Starting PyAutoGUI server on port ${port}...`);

// kill process on port first; if nothing is listening, silently ignore
try {
  execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
  console.log(`Killed existing process on port ${port}`);
} catch (error) {
  console.warn(`No existing process to kill on port ${port}`);
}

const server = spawn('python3', [serverPath, port], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  },
});

server.on('error', (error) => {
  console.error('Failed to start PyAutoGUI server:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`PyAutoGUI server exited with code ${code}`);
  process.exit(code || 0);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down PyAutoGUI server...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nShutting down PyAutoGUI server...');
  server.kill('SIGTERM');
});
