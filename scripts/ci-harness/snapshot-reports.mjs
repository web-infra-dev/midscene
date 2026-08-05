import { access, cp, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

function insideWorkspace(workspace, inputPath) {
  if (!inputPath) throw new Error('Report snapshot path is required');
  const resolved = path.resolve(workspace, inputPath);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Report snapshot path must stay inside the workspace: ${inputPath}`);
  }
  return resolved;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

try {
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const source = insideWorkspace(workspace, process.env.HARNESS_SNAPSHOT_SOURCE);
  const destination = insideWorkspace(
    workspace,
    process.env.HARNESS_SNAPSHOT_DESTINATION,
  );
  if (await exists(destination)) {
    throw new Error(`Report snapshot is immutable and already exists: ${destination}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  if (await exists(source)) {
    if (process.env.HARNESS_SNAPSHOT_MODE === 'copy') {
      await cp(source, destination, { recursive: true, errorOnExist: true });
    } else {
      await rename(source, destination);
    }
  }
  else await mkdir(destination, { recursive: true });
} catch (error) {
  console.error(`::error::Unable to snapshot reports: ${error.stack || error}`);
  process.exitCode = 1;
}
