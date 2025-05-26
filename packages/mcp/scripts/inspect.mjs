import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allConfigFromEnv } from '@midscene/web/bridge-mode';
import dotenv from 'dotenv';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the path to the .env file (two levels up from scripts directory)
const envPath = path.resolve(__dirname, '..', '..', '..', '.env');

console.log(`Attempting to load environment variables from: ${envPath}`);

// Load environment variables from the specified path
const configResult = dotenv.config({
  path: envPath,
});

if (configResult.error) {
  console.warn(
    `Warning: Could not load .env file from ${envPath}. Proceeding without it.`,
    configResult.error,
  );
} else {
  console.log(`.env file loaded successfully from ${envPath}`);
}

// Prepare the command and arguments
const command = 'npx';
const keys = Object.keys(allConfigFromEnv());
const envOverrides = {};
for (const key of keys) {
  const value = process.env[key];
  if (value !== undefined) {
    envOverrides[key] = value;
  }
}
console.log(envOverrides);
const args = [
  'mcp-inspector',
  'node',
  path.resolve(__dirname, '..', 'dist', 'index.cjs'), // Use resolved path for robustness
  ...Object.entries(envOverrides).map(([key, value]) => `-e ${key}=${value}`),
];

console.log(`Executing command: ${command} ${args.join(' ')}`);

// Spawn the child process
const child = spawn(command, args, {
  stdio: 'inherit', // Inherit stdin, stdout, stderr from the parent process
  shell: process.platform === 'win32', // Use shell on Windows for npx compatibility
});

// Handle errors during spawning (e.g., command not found)
child.on('error', (error) => {
  console.error(`Failed to start subprocess: ${error.message}`);
});

// Handle process exit
child.on('close', (code) => {
  console.log(`Subprocess exited with code ${code}`);
  process.exit(code !== null && code !== undefined ? code : 1);
});

// Handle signals to gracefully shut down the child process
const handleSignal = (signal) => {
  console.log(`Received ${signal}. Forwarding to subprocess.`);
  child.kill(signal);
};

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);
