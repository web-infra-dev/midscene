import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { packager } from '@electron/packager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const studioRootDir = path.resolve(__dirname, '..');
const workspaceRootDir = path.resolve(studioRootDir, '..', '..');

// Keep release staging outside `apps/studio` so `pnpm deploy` does not scan
// or recursively copy prior `.release` outputs back into the package payload.
export const releaseWorkspaceDir = path.join(
  workspaceRootDir,
  '.release',
  'studio',
);
export const artifactDir = path.join(releaseWorkspaceDir, 'artifacts');
const deployDir = path.join(releaseWorkspaceDir, 'deploy');
const packagedDir = path.join(releaseWorkspaceDir, 'packaged');
const packagedAppId = 'midscene-studio';
const packagedProductName = 'Midscene Studio';
const packagedIgnorePatterns = [
  /^\/midscene_run($|\/)/,
  /^\/postcss\.config\.mjs$/,
  /^\/rsbuild\.config\.ts$/,
  /^\/scripts($|\/)/,
  /^\/src($|\/)/,
  /^\/tests($|\/)/,
  /^\/tsconfig\.json$/,
  /^\/vitest\.config\.ts$/,
];

const supportedPlatforms = new Set(['darwin', 'linux', 'win32']);

export const shouldUseShellForCommand = (
  command,
  platform = process.platform,
) => platform === 'win32' && /\.(cmd|bat)$/i.test(command);

const run = (command, args, { cwd = workspaceRootDir, env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: shouldUseShellForCommand(command),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed with exit code ${code}: ${command} ${args.join(' ')}`,
        ),
      );
    });
  });

export const normalizeReleaseVersion = (version) => {
  const trimmed = version?.trim();

  if (!trimmed) {
    throw new Error(
      'A release version is required. Pass --version=<version> when packaging Midscene Studio.',
    );
  }

  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
};

export const buildArtifactBaseName = ({ version, platform, arch }) => {
  if (!supportedPlatforms.has(platform)) {
    throw new Error(
      `Unsupported Electron platform "${platform}". Expected one of: ${Array.from(supportedPlatforms).join(', ')}`,
    );
  }

  if (!arch) {
    throw new Error('An Electron arch is required.');
  }

  return `${packagedAppId}-v${normalizeReleaseVersion(version)}-${platform}-${arch}`;
};

export const buildPackagedAppManifest = (packageJson, version) => ({
  name: packagedAppId,
  productName: packagedProductName,
  private: true,
  version: normalizeReleaseVersion(version),
  description:
    packageJson.description ?? 'Midscene Studio packaged Electron application',
  license: packageJson.license,
  author: packageJson.author,
  type: packageJson.type,
  main: 'dist/main/main.cjs',
  dependencies: packageJson.dependencies ?? {},
});

export const buildPackagerOptions = ({ arch, outDir, platform, stageDir }) => ({
  arch,
  // Keep the app directory unpacked so pnpm's dependency graph can stay
  // symlink-based. `electron-packager` rewrites those links to absolute source
  // paths during copy, so a later post-process step rewires them back to
  // portable in-app relative links.
  asar: false,
  derefSymlinks: false,
  dir: stageDir,
  electronVersion: getStudioElectronVersion(),
  ignore: packagedIgnorePatterns,
  name: packagedProductName,
  out: outDir,
  overwrite: true,
  platform,
  prune: false,
});

const packageManagerCommand =
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

let cachedStudioElectronVersion;

export const getStudioElectronVersion = () => {
  if (cachedStudioElectronVersion) {
    return cachedStudioElectronVersion;
  }

  const studioPackageJson = JSON.parse(
    readFileSync(path.join(studioRootDir, 'package.json'), 'utf8'),
  );
  const electronVersion =
    studioPackageJson.dependencies?.electron ??
    studioPackageJson.devDependencies?.electron ??
    studioPackageJson.dependencies?.['electron-nightly'] ??
    studioPackageJson.devDependencies?.['electron-nightly'];

  if (!electronVersion) {
    throw new Error(
      'Midscene Studio package.json must declare electron or electron-nightly.',
    );
  }

  cachedStudioElectronVersion = electronVersion;
  return electronVersion;
};

const removeIfExists = async (targetPath) => {
  await fs.rm(targetPath, { force: true, recursive: true });
};

const resolveSymlinkTarget = (entryPath, targetPath) =>
  path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(path.dirname(entryPath), targetPath);

export const collectPackagedNodeModuleSymlinkIssues = async (
  rootDir,
  issues = [],
) => {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return issues;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    const stats = await fs.lstat(entryPath);

    if (stats.isSymbolicLink()) {
      const targetPath = await fs.readlink(entryPath);
      const resolvedTargetPath = resolveSymlinkTarget(entryPath, targetPath);
      const issue = {
        path: entryPath,
        target: targetPath,
      };

      if (path.isAbsolute(targetPath)) {
        issues.push({
          ...issue,
          reason: 'absolute',
        });
        continue;
      }

      try {
        await fs.access(resolvedTargetPath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          issues.push({
            ...issue,
            reason: 'broken',
          });
          continue;
        }
        throw error;
      }
      continue;
    }

    if (stats.isDirectory()) {
      await collectPackagedNodeModuleSymlinkIssues(entryPath, issues);
    }
  }

  return issues;
};

const findPackagedNodeModulesDir = async (packagedAppPath) => {
  const candidates = [
    path.join(packagedAppPath, 'Contents', 'Resources', 'app', 'node_modules'),
    path.join(packagedAppPath, 'resources', 'app', 'node_modules'),
  ];

  for (const candidatePath of candidates) {
    try {
      const stats = await fs.stat(candidatePath);
      if (stats.isDirectory()) {
        return candidatePath;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
};

const findPackagedAppPayloadDir = async (packagedAppPath) => {
  const candidates = [
    path.join(packagedAppPath, 'Contents', 'Resources', 'app'),
    path.join(packagedAppPath, 'resources', 'app'),
  ];

  for (const candidatePath of candidates) {
    try {
      const stats = await fs.stat(candidatePath);
      if (stats.isDirectory()) {
        return candidatePath;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
};

const getSymlinkKind = (targetStats) =>
  process.platform === 'win32' && targetStats.isDirectory()
    ? 'junction'
    : undefined;

export const rewritePackagedNodeModuleSymlinks = async ({
  packagedAppPath,
  stageDir,
}) => {
  const packagedNodeModulesDir =
    await findPackagedNodeModulesDir(packagedAppPath);
  const packagedAppPayloadDir =
    await findPackagedAppPayloadDir(packagedAppPath);

  if (!packagedNodeModulesDir || !packagedAppPayloadDir) {
    return [];
  }

  const normalizedStageDir = path.resolve(stageDir);
  const rewrittenLinks = [];
  const pendingDirs = [packagedNodeModulesDir];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      const stats = await fs.lstat(entryPath);

      if (stats.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }

      if (!stats.isSymbolicLink()) {
        continue;
      }

      const targetPath = await fs.readlink(entryPath);
      if (!path.isAbsolute(targetPath)) {
        continue;
      }

      const normalizedTargetPath = path.resolve(targetPath);
      if (
        normalizedTargetPath !== normalizedStageDir &&
        !normalizedTargetPath.startsWith(`${normalizedStageDir}${path.sep}`)
      ) {
        continue;
      }

      const rewrittenTargetPath = path.join(
        packagedAppPayloadDir,
        path.relative(normalizedStageDir, normalizedTargetPath),
      );
      const rewrittenTargetStats = await fs.stat(rewrittenTargetPath);
      const relativeTargetPath = path.relative(
        path.dirname(entryPath),
        rewrittenTargetPath,
      );

      await fs.unlink(entryPath);
      await fs.symlink(
        relativeTargetPath,
        entryPath,
        getSymlinkKind(rewrittenTargetStats),
      );
      rewrittenLinks.push(entryPath);
    }
  }

  return rewrittenLinks;
};

export const assertPortablePackagedNodeModules = async (packagedAppPath) => {
  const packagedNodeModulesDir =
    await findPackagedNodeModulesDir(packagedAppPath);
  if (!packagedNodeModulesDir) {
    return;
  }

  const issues = await collectPackagedNodeModuleSymlinkIssues(
    packagedNodeModulesDir,
  );

  if (issues.length === 0) {
    return;
  }

  const formattedIssues = issues
    .slice(0, 5)
    .map(({ path: issuePath, target, reason }) => {
      const relativeIssuePath = path.relative(packagedAppPath, issuePath);
      return `${relativeIssuePath} -> ${target} (${reason})`;
    })
    .join('; ');

  throw new Error(
    `Packaged Midscene Studio app contains non-portable node_modules symlinks: ${formattedIssues}`,
  );
};

const deployPackagedWorkspace = async (stageDir) => {
  await removeIfExists(stageDir);
  await fs.mkdir(path.dirname(stageDir), { recursive: true });
  await run(
    packageManagerCommand,
    ['--filter', 'studio', 'deploy', '--prod', stageDir],
    {
      env: {
        npm_config_ignore_scripts: 'true',
      },
    },
  );
};

const updateStageManifest = async ({ stageDir, version }) => {
  const manifestPath = path.join(stageDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const packagedManifest = buildPackagedAppManifest(packageJson, version);
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(packagedManifest, null, 2)}\n`,
  );
};

const archiveWithDitto = async ({ sourcePath, artifactPath }) => {
  await run('ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    sourcePath,
    artifactPath,
  ]);
};

const archiveWithZip = async ({ sourcePath, artifactPath }) => {
  await run('zip', ['-qry', artifactPath, path.basename(sourcePath)], {
    cwd: path.dirname(sourcePath),
  });
};

const archiveWithPowerShell = async ({ sourcePath, artifactPath }) => {
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${sourcePath}' -DestinationPath '${artifactPath}' -Force`,
  ]);
};

const archivePackagedApp = async ({
  hostPlatform,
  sourcePath,
  artifactPath,
}) => {
  await removeIfExists(artifactPath);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });

  if (hostPlatform === 'darwin') {
    await archiveWithDitto({ sourcePath, artifactPath });
    return artifactPath;
  }

  if (hostPlatform === 'win32') {
    await archiveWithPowerShell({ sourcePath, artifactPath });
    return artifactPath;
  }

  await archiveWithZip({ sourcePath, artifactPath });
  return artifactPath;
};

export const packageStudioElectronApp = async ({
  version,
  platform = process.platform,
  arch = process.arch,
} = {}) => {
  const normalizedVersion = normalizeReleaseVersion(version);
  const baseName = buildArtifactBaseName({
    version: normalizedVersion,
    platform,
    arch,
  });
  const stageDir = path.join(deployDir, baseName);

  await deployPackagedWorkspace(stageDir);
  await updateStageManifest({ stageDir, version: normalizedVersion });

  await removeIfExists(packagedDir);
  await fs.mkdir(packagedDir, { recursive: true });

  const packagedAppPaths = await packager(
    buildPackagerOptions({
      arch,
      outDir: packagedDir,
      platform,
      stageDir,
    }),
  );

  if (packagedAppPaths.length !== 1) {
    throw new Error(
      `Expected one packaged app output, received ${packagedAppPaths.length}.`,
    );
  }

  const packagedAppPath = packagedAppPaths[0];
  const artifactPath = path.join(artifactDir, `${baseName}.zip`);

  await rewritePackagedNodeModuleSymlinks({
    packagedAppPath,
    stageDir,
  });
  await assertPortablePackagedNodeModules(packagedAppPath);

  await archivePackagedApp({
    hostPlatform: process.platform,
    sourcePath: packagedAppPath,
    artifactPath,
  });

  console.log(`Packaged Midscene Studio archive: ${artifactPath}`);
  return artifactPath;
};

const isDirectInvocation =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) {
  const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const { values } = parseArgs({
    args: cliArgs,
    allowPositionals: false,
    options: {
      arch: { type: 'string' },
      platform: { type: 'string' },
      version: { type: 'string' },
    },
  });

  const version =
    values.version ??
    JSON.parse(
      await fs.readFile(path.join(studioRootDir, 'package.json'), 'utf8'),
    ).version;

  await packageStudioElectronApp({
    arch: values.arch,
    platform: values.platform,
    version,
  });
}
