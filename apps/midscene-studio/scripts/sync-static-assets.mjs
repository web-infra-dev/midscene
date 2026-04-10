import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'assets');
const targetDir = path.join(rootDir, 'dist/assets');

await fs.access(sourceDir);
await fs.rm(targetDir, { force: true, recursive: true });
await fs.mkdir(path.dirname(targetDir), { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

console.log(`Synced Midscene Studio static assets to ${targetDir}`);
