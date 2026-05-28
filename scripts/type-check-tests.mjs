import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceConfigPath = join(workspaceRoot, 'pnpm-workspace.yaml');
const tscPath = require.resolve('typescript/bin/tsc');
const excludedProjects = new Set(['apps/site', 'packages/evaluation']);
const concurrency = 5;

function readWorkspacePatterns() {
  const workspaceConfig = fs.readFileSync(workspaceConfigPath, 'utf8');
  return workspaceConfig
    .split('\n')
    .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1])
    .filter(Boolean);
}

function expandWorkspacePattern(pattern) {
  if (!pattern.endsWith('/*')) {
    throw new Error(`Unsupported workspace pattern: ${pattern}`);
  }

  const parentDir = join(workspaceRoot, pattern.slice(0, -2));
  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pattern.slice(0, -2), entry.name));
}

function hasTests(project) {
  const testsPath = join(workspaceRoot, project, 'tests');
  return fs.existsSync(testsPath) && fs.statSync(testsPath).isDirectory();
}

const projects = readWorkspacePatterns()
  .flatMap(expandWorkspacePattern)
  .filter((project) => !excludedProjects.has(project))
  .filter((project) => hasTests(project))
  .filter((project) =>
    fs.existsSync(join(workspaceRoot, project, 'tsconfig.json')),
  )
  .sort();

function typeCheckProject(project) {
  const projectPath = join(workspaceRoot, project);
  const projectConfig = join(projectPath, 'tsconfig.json');

  return new Promise((resolve) => {
    let output = '';
    const child = spawn(
      process.execPath,
      [tscPath, '-p', projectConfig, '--noEmit', '--pretty', 'false'],
      {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (error) => {
      output += `${error.stack || error.message}\n`;
      resolve({ project, status: 1, output });
    });
    child.on('close', (status) => {
      resolve({ project, status: status ?? 1, output });
    });
  });
}

async function runTypeChecks() {
  const running = new Set();
  const results = [];

  for (const project of projects) {
    const task = typeCheckProject(project).then((result) => {
      running.delete(task);
      results.push(result);

      console.log(`\nType checking tests for ${result.project}`);
      if (result.output) {
        process.stdout.write(result.output);
        if (!result.output.endsWith('\n')) {
          process.stdout.write('\n');
        }
      }
    });

    running.add(task);
    if (running.size >= concurrency) {
      await Promise.race(running);
    }
  }

  await Promise.all(running);

  const failedProjects = results
    .filter((result) => result.status !== 0)
    .map((result) => result.project);

  if (failedProjects.length > 0) {
    console.error(
      `\nTest type check failed for ${failedProjects.length} project(s):`,
    );
    for (const project of failedProjects.sort()) {
      console.error(`- ${project}`);
    }

    process.exit(1);
  }
}

await runTypeChecks();
