import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initialBuildReadyPattern,
  studioRendererDepsReadyFile,
} from './studio-dev-deps.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const prebuildSpecs = [
  { name: 'shared', args: ['--dir', 'packages/shared', 'run', 'build'] },
  { name: 'core', args: ['--dir', 'packages/core', 'run', 'build'] },
  { name: 'android', args: ['--dir', 'packages/android', 'run', 'build'] },
  {
    name: 'playground',
    args: ['--dir', 'packages/playground', 'run', 'build'],
  },
  {
    name: 'visualizer',
    args: ['--dir', 'packages/visualizer', 'run', 'build'],
  },
  {
    name: 'playground-app',
    args: ['--dir', 'packages/playground-app', 'run', 'build'],
  },
  {
    name: 'android-playground',
    args: ['--dir', 'packages/android-playground', 'run', 'build'],
  },
];

const watchSpecs = [
  {
    name: 'playground',
    args: ['--dir', 'packages/playground', 'run', 'build:watch'],
  },
  {
    name: 'visualizer',
    args: ['--dir', 'packages/visualizer', 'run', 'build:watch'],
  },
  {
    name: 'playground-app',
    args: ['--dir', 'packages/playground-app', 'run', 'build:watch'],
  },
  {
    name: 'android-playground',
    args: ['--dir', 'packages/android-playground', 'run', 'build:watch'],
  },
];

const stripAnsi = (value) => {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\u001b' || value[index + 1] !== '[') {
      result += char;
      continue;
    }

    index += 2;

    while (index < value.length) {
      const code = value.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        break;
      }
      index += 1;
    }
  }

  return result;
};

const prefixLine = (name, line, stream) => {
  if (!line) {
    stream.write('\n');
    return;
  }

  stream.write(`[${name}] ${line}\n`);
};

const pipeLines = (stream, name, output, onLine) => {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += chunk.toString();

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      prefixLine(name, line, output);
      onLine?.(stripAnsi(line));
    }
  });

  stream.on('end', () => {
    if (!buffer) {
      return;
    }

    const line = buffer.replace(/\r$/, '');
    prefixLine(name, line, output);
    onLine?.(stripAnsi(line));
    buffer = '';
  });
};

const spawnPnpm = (name, args) =>
  spawn('pnpm', args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const runPrebuild = (spec) =>
  new Promise((resolve, reject) => {
    const child = spawnPnpm(spec.name, spec.args);

    pipeLines(child.stdout, spec.name, process.stdout);
    pipeLines(child.stderr, spec.name, process.stderr);

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${spec.name} prebuild failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
          }`,
        ),
      );
    });
  });

await fs.mkdir(path.dirname(studioRendererDepsReadyFile), { recursive: true });
await fs.rm(studioRendererDepsReadyFile, { force: true });

console.log('Preparing Midscene Studio dependency builds...');

for (const spec of prebuildSpecs) {
  console.log(`Prebuilding ${spec.name}...`);
  await runPrebuild(spec);
}

console.log('Starting Midscene Studio dependency watchers...');

const readyDeps = new Set();
const children = [];
let shuttingDown = false;
let readyFileWritten = false;

const maybeWriteReadyFile = async () => {
  if (readyFileWritten || readyDeps.size < watchSpecs.length) {
    return;
  }

  readyFileWritten = true;
  await fs.writeFile(studioRendererDepsReadyFile, `${Date.now()}\n`, 'utf8');
  console.log('Midscene Studio dependency watchers are ready.');
};

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await fs.rm(studioRendererDepsReadyFile, { force: true }).catch(() => {});

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 3000).unref();

  process.exit(exitCode);
};

for (const spec of watchSpecs) {
  const child = spawnPnpm(spec.name, spec.args);
  children.push(child);

  pipeLines(child.stdout, spec.name, process.stdout, (line) => {
    if (!readyDeps.has(spec.name) && initialBuildReadyPattern.test(line)) {
      readyDeps.add(spec.name);
      void maybeWriteReadyFile();
    }
  });
  pipeLines(child.stderr, spec.name, process.stderr);

  child.on('error', async (error) => {
    console.error(`[${spec.name}] watcher failed to start: ${error.message}`);
    await shutdown(1);
  });

  child.on('exit', async (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(
      `[${spec.name}] watcher exited unexpectedly with ${
        signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
      }`,
    );
    await shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

await new Promise(() => {});
