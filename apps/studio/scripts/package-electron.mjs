import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { packager } from '@electron/packager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const studioRootDir = path.resolve(__dirname, '..');
const workspaceRootDir = path.resolve(studioRootDir, '..', '..');

// Keep release packaging state outside `apps/studio` so local build outputs do
// not recurse back into the generated Electron payload.
export const releaseWorkspaceDir = path.join(
  workspaceRootDir,
  '.release',
  'studio',
);
export const artifactDir = path.join(releaseWorkspaceDir, 'artifacts');
const packagingWorkspaceDir = path.join(releaseWorkspaceDir, 'workspace');
const packagedDir = path.join(releaseWorkspaceDir, 'packaged');
const packagedAppId = 'midscene-studio';
const packagedProductName = 'Midscene Studio';
const packagedIgnorePatterns = [/^\/pnpm-lock\.yaml$/, /^\/vendor($|\/)/];
const packageBuildSourceTargets = [
  'src',
  'html',
  'bin',
  'package.json',
  'project.json',
  'tsconfig.json',
  'tsup.config.ts',
  'rslib.config.ts',
  'rslib.config.mjs',
  'rslib.inspect.config.ts',
];
const studioBuildSourceTargets = [
  'src',
  'package.json',
  'project.json',
  'tsconfig.json',
  'postcss.config.mjs',
  'rsbuild.config.ts',
];
const playgroundAppBuildSourceTargets = [
  'src',
  'package.json',
  'project.json',
  'tsconfig.json',
  'postcss.config.mjs',
  'rsbuild.config.ts',
];
const staticWorkspacePackageSourceConfigs = [
  {
    appRelativeDir: 'apps/playground',
    packageNames: [
      '@midscene/playground',
      '@midscene/ios',
      '@midscene/harmony',
    ],
  },
  {
    appRelativeDir: 'apps/android-playground',
    packageNames: ['@midscene/android-playground'],
  },
  {
    appRelativeDir: 'apps/computer-playground',
    packageNames: ['@midscene/computer-playground'],
  },
].map((config) => ({
  ...config,
  appDir: path.join(workspaceRootDir, config.appRelativeDir),
  distDir: path.join(workspaceRootDir, config.appRelativeDir, 'dist'),
  faviconPath: path.join(
    workspaceRootDir,
    config.appRelativeDir,
    'src',
    'favicon.ico',
  ),
}));

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

export const buildPackagedAppManifest = (
  packageJson,
  version,
  dependencies = packageJson.dependencies ?? {},
) => ({
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
  dependencies,
});

export const buildPackagerOptions = ({ arch, outDir, platform, stageDir }) => ({
  arch,
  // Keep the app directory unpacked. The staging workspace installs vendored
  // local packages into a hoisted node_modules layout with portable relative
  // links. Preserve that layout during packaging so helper symlinks do not get
  // expanded into duplicated dependency trees.
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
let cachedStudioPackageJson;
let cachedWorkspacePackageCatalog;

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

const readPackageJsonSync = (targetPath) =>
  JSON.parse(readFileSync(targetPath, 'utf8'));

const getStudioPackageJson = () => {
  if (!cachedStudioPackageJson) {
    cachedStudioPackageJson = readPackageJsonSync(
      path.join(studioRootDir, 'package.json'),
    );
  }

  return cachedStudioPackageJson;
};

const getWorkspacePackageCatalog = () => {
  if (cachedWorkspacePackageCatalog) {
    return cachedWorkspacePackageCatalog;
  }

  const packageCatalog = new Map();
  for (const scopeDir of ['apps', 'packages']) {
    const baseDir = path.join(workspaceRootDir, scopeDir);
    for (const entry of readdirSync(baseDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageDir = path.join(baseDir, entry.name);
      const packageJsonPath = path.join(packageDir, 'package.json');
      try {
        const packageJson = readPackageJsonSync(packageJsonPath);
        packageCatalog.set(packageJson.name, {
          name: packageJson.name,
          packageDir,
          packageJson,
          relativeDir: path.relative(workspaceRootDir, packageDir),
        });
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  cachedWorkspacePackageCatalog = packageCatalog;
  return packageCatalog;
};

const getStudioRuntimeWorkspaceDependencyNames = (
  packageJson = getStudioPackageJson(),
) =>
  Object.entries(packageJson.dependencies ?? {})
    .filter(
      ([, version]) =>
        typeof version === 'string' && version.startsWith('workspace:'),
    )
    .map(([dependencyName]) => dependencyName);

export const collectWorkspaceDependencyClosure = (
  rootDependencyNames,
  packageCatalog = getWorkspacePackageCatalog(),
) => {
  const visitedPackageNames = new Set();
  const orderedPackages = [];

  const visitPackage = (packageName) => {
    if (visitedPackageNames.has(packageName)) {
      return;
    }
    visitedPackageNames.add(packageName);

    const packageEntry = packageCatalog.get(packageName);
    if (!packageEntry) {
      throw new Error(
        `Unable to resolve workspace package "${packageName}" from the Midscene workspace.`,
      );
    }

    const workspaceDependencies = {
      ...(packageEntry.packageJson.dependencies ?? {}),
      ...(packageEntry.packageJson.optionalDependencies ?? {}),
    };

    for (const [dependencyName, dependencyVersion] of Object.entries(
      workspaceDependencies,
    )) {
      if (
        typeof dependencyVersion === 'string' &&
        dependencyVersion.startsWith('workspace:')
      ) {
        visitPackage(dependencyName);
      }
    }

    orderedPackages.push(packageEntry);
  };

  for (const dependencyName of rootDependencyNames) {
    visitPackage(dependencyName);
  }

  return orderedPackages;
};

const collectLatestMtime = async (targetPath) => {
  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latestMtime = stats.mtimeMs;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    latestMtime = Math.max(
      latestMtime,
      await collectLatestMtime(path.join(targetPath, entry.name)),
    );
  }

  return latestMtime;
};

const getBuildStatus = async ({ packageDir, sourceTargets }) => {
  const distDir = path.join(packageDir, 'dist');
  try {
    const distStats = await fs.stat(distDir);
    if (!distStats.isDirectory()) {
      return {
        needsBuild: true,
        reason: 'dist output is missing',
      };
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        needsBuild: true,
        reason: 'dist output is missing',
      };
    }
    throw error;
  }

  const latestSourceMtime = await Promise.all(
    sourceTargets.map((target) =>
      collectLatestMtime(path.join(packageDir, target)),
    ),
  ).then((mtimes) => Math.max(0, ...mtimes));
  const latestDistMtime = await collectLatestMtime(distDir);

  if (latestSourceMtime > latestDistMtime) {
    return {
      needsBuild: true,
      reason: 'source files are newer than build output',
    };
  }

  return {
    needsBuild: false,
    reason: 'up to date',
  };
};

const buildPackageDir = async (packageDir) => {
  await run(packageManagerCommand, ['--dir', packageDir, 'build']);
};

const prepareStudioWorkspacePackages = async (workspacePackages) => {
  for (const workspacePackage of workspacePackages) {
    const status = await getBuildStatus({
      packageDir: workspacePackage.packageDir,
      sourceTargets: packageBuildSourceTargets,
    });

    if (!status.needsBuild) {
      console.log(
        `Skipping ${workspacePackage.relativeDir} (${status.reason}).`,
      );
      continue;
    }

    console.log(`Building ${workspacePackage.relativeDir} (${status.reason}).`);
    await buildPackageDir(workspacePackage.relativeDir);
  }
};

const prepareStudioBuildOutput = async () => {
  const status = await getBuildStatus({
    packageDir: studioRootDir,
    sourceTargets: studioBuildSourceTargets,
  });

  if (!status.needsBuild) {
    console.log(`Skipping apps/studio build (${status.reason}).`);
    return;
  }

  console.log(`Building apps/studio (${status.reason}).`);
  await buildPackageDir(path.relative(workspaceRootDir, studioRootDir));
};

const getStaticWorkspacePackageSourceConfig = (packageName) =>
  staticWorkspacePackageSourceConfigs.find((config) =>
    config.packageNames.includes(packageName),
  ) ?? null;

const prepareStaticWorkspacePackageSources = async (workspacePackages) => {
  const requiredStaticConfigs = new Map();
  for (const workspacePackage of workspacePackages) {
    const staticSourceConfig = getStaticWorkspacePackageSourceConfig(
      workspacePackage.name,
    );
    if (!staticSourceConfig) {
      continue;
    }

    requiredStaticConfigs.set(
      staticSourceConfig.appRelativeDir,
      staticSourceConfig,
    );
  }

  for (const staticSourceConfig of requiredStaticConfigs.values()) {
    const status = await getBuildStatus({
      packageDir: staticSourceConfig.appDir,
      sourceTargets: playgroundAppBuildSourceTargets,
    });

    if (!status.needsBuild) {
      console.log(
        `Skipping ${staticSourceConfig.appRelativeDir} (${status.reason}).`,
      );
      continue;
    }

    console.log(
      `Building ${staticSourceConfig.appRelativeDir} (${status.reason}).`,
    );
    await buildPackageDir(staticSourceConfig.appRelativeDir);
  }
};

export const buildVendoredWorkspaceDirName = (packageName) =>
  packageName.replace(/^@/, '').replace(/\//g, '-');

const buildResolvedWorkspaceDependencyVersions = ({
  dependencies,
  workspacePackages,
}) => {
  const resolvedDependencies = {};
  const workspaceVersions = new Map(
    workspacePackages.map((workspacePackage) => [
      workspacePackage.name,
      workspacePackage.packageJson.version,
    ]),
  );

  for (const [dependencyName, dependencyVersion] of Object.entries(
    dependencies ?? {},
  )) {
    if (
      typeof dependencyVersion === 'string' &&
      dependencyVersion.startsWith('workspace:')
    ) {
      const resolvedVersion = workspaceVersions.get(dependencyName);
      if (!resolvedVersion) {
        throw new Error(
          `Missing packaged workspace version for dependency "${dependencyName}".`,
        );
      }
      resolvedDependencies[dependencyName] = resolvedVersion;
      continue;
    }

    resolvedDependencies[dependencyName] = dependencyVersion;
  }

  return resolvedDependencies;
};

export const buildVendoredWorkspaceManifest = ({
  packageJson,
  workspacePackages,
}) => {
  const {
    devDependencies: _devDependencies,
    scripts: _scripts,
    ...vendoredManifest
  } = packageJson;

  for (const dependencyField of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const resolvedDependencies = buildResolvedWorkspaceDependencyVersions({
      dependencies: vendoredManifest[dependencyField],
      workspacePackages,
    });

    if (Object.keys(resolvedDependencies).length === 0) {
      delete vendoredManifest[dependencyField];
      continue;
    }

    vendoredManifest[dependencyField] = resolvedDependencies;
  }

  return vendoredManifest;
};

const ensurePathExists = async (targetPath, { ignoreMissing = false } = {}) => {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (ignoreMissing) {
        return null;
      }
      throw new Error(
        `Expected packaging input to exist, but it is missing: ${targetPath}`,
      );
    }
    throw error;
  }
};

const copyRelativePath = async ({
  sourcePath,
  destinationPath,
  ignoreMissing = false,
}) => {
  const sourceStats = await ensurePathExists(sourcePath, { ignoreMissing });
  if (!sourceStats) {
    return false;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.cp(sourcePath, destinationPath, {
    recursive: sourceStats.isDirectory(),
  });
  return true;
};

const copyStaticWorkspacePackageFiles = async ({
  staticSourceConfig,
  destinationPath,
}) => {
  await copyRelativePath({
    sourcePath: staticSourceConfig.distDir,
    destinationPath,
  });

  try {
    await fs.copyFile(
      staticSourceConfig.faviconPath,
      path.join(destinationPath, 'favicon.ico'),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
};

const collectPublishEntries = (packageJson) => {
  const publishEntries = new Set(packageJson.files ?? []);
  for (const binPath of Object.values(packageJson.bin ?? {})) {
    publishEntries.add(binPath);
  }

  publishEntries.delete('package.json');
  return [...publishEntries];
};

export const pruneSourceMapFiles = async (rootDir) => {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await pruneSourceMapFiles(entryPath);
      continue;
    }

    if (entry.name.endsWith('.map')) {
      await fs.rm(entryPath, { force: true });
    }
  }
};

const vendorWorkspacePackages = async ({ workspacePackages, vendorDir }) => {
  await removeIfExists(vendorDir);
  await fs.mkdir(vendorDir, { recursive: true });

  const vendoredWorkspacePackages = [];
  for (const workspacePackage of workspacePackages) {
    const vendorDirName = buildVendoredWorkspaceDirName(workspacePackage.name);
    const vendorPackageDir = path.join(vendorDir, vendorDirName);
    const staticSourceConfig = getStaticWorkspacePackageSourceConfig(
      workspacePackage.name,
    );

    await removeIfExists(vendorPackageDir);
    await fs.mkdir(vendorPackageDir, { recursive: true });

    for (const publishEntry of collectPublishEntries(
      workspacePackage.packageJson,
    )) {
      const destinationPath = path.join(vendorPackageDir, publishEntry);
      if (publishEntry === 'static' && staticSourceConfig) {
        await copyStaticWorkspacePackageFiles({
          staticSourceConfig,
          destinationPath,
        });
        continue;
      }

      await copyRelativePath({
        sourcePath: path.join(workspacePackage.packageDir, publishEntry),
        destinationPath,
        ignoreMissing: true,
      });
    }

    await pruneSourceMapFiles(vendorPackageDir);
    await fs.writeFile(
      path.join(vendorPackageDir, 'package.json'),
      `${JSON.stringify(
        buildVendoredWorkspaceManifest({
          packageJson: workspacePackage.packageJson,
          workspacePackages,
        }),
        null,
        2,
      )}\n`,
    );

    vendoredWorkspacePackages.push({
      ...workspacePackage,
      vendorDirName,
    });
  }

  return vendoredWorkspacePackages;
};

export const buildInstallWorkspaceManifest = ({
  packageJson,
  version,
  vendoredWorkspacePackages,
}) => {
  const dependencies = buildResolvedWorkspaceDependencyVersions({
    dependencies: packageJson.dependencies,
    workspacePackages: vendoredWorkspacePackages,
  });
  const overrides = Object.fromEntries(
    vendoredWorkspacePackages.map((workspacePackage) => [
      workspacePackage.name,
      `file:vendor/${workspacePackage.vendorDirName}`,
    ]),
  );

  return {
    ...buildPackagedAppManifest(packageJson, version, dependencies),
    pnpm: {
      overrides,
    },
  };
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

const buildPackagedAppPayloadCandidates = async (packagedAppPath) => {
  const candidates = [
    path.join(packagedAppPath, 'Contents', 'Resources', 'app'),
    path.join(packagedAppPath, 'resources', 'app'),
  ];

  let packagedOutputStats;
  try {
    packagedOutputStats = await fs.stat(packagedAppPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return candidates;
    }
    throw error;
  }

  if (!packagedOutputStats.isDirectory()) {
    return candidates;
  }

  const packagedOutputEntries = await fs.readdir(packagedAppPath, {
    withFileTypes: true,
  });

  for (const entry of packagedOutputEntries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
      continue;
    }

    const nestedBundleRoot = path.join(packagedAppPath, entry.name);
    candidates.push(
      path.join(nestedBundleRoot, 'Contents', 'Resources', 'app'),
      path.join(nestedBundleRoot, 'resources', 'app'),
    );
  }

  return [...new Set(candidates)];
};

const findPackagedAppPayloadDir = async (packagedAppPath) => {
  const candidates = await buildPackagedAppPayloadCandidates(packagedAppPath);

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

const findPackagedNodeModulesDir = async (packagedAppPath) => {
  const packagedAppPayloadDir =
    await findPackagedAppPayloadDir(packagedAppPath);
  if (!packagedAppPayloadDir) {
    return null;
  }

  const packagedNodeModulesDir = path.join(
    packagedAppPayloadDir,
    'node_modules',
  );
  try {
    const stats = await fs.stat(packagedNodeModulesDir);
    if (stats.isDirectory()) {
      return packagedNodeModulesDir;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
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

const copyStudioBuildOutputToStageDir = async (stageDir) => {
  await fs.mkdir(stageDir, { recursive: true });
  await fs.cp(path.join(studioRootDir, 'dist'), path.join(stageDir, 'dist'), {
    recursive: true,
  });
};

const installStageDependencies = async (stageDir) => {
  await run(
    packageManagerCommand,
    [
      'install',
      '--prod',
      '--ignore-workspace',
      '--config.node-linker=hoisted',
      '--config.package-import-method=clone-or-copy',
      '--no-frozen-lockfile',
    ],
    {
      cwd: stageDir,
    },
  );
};

const createPackagingWorkspace = async ({ stageDir, version }) => {
  const studioPackageJson = getStudioPackageJson();
  const workspacePackages = collectWorkspaceDependencyClosure(
    getStudioRuntimeWorkspaceDependencyNames(studioPackageJson),
  );
  const vendorDir = path.join(stageDir, 'vendor');

  await prepareStaticWorkspacePackageSources(workspacePackages);
  await prepareStudioWorkspacePackages(workspacePackages);
  await prepareStudioBuildOutput();
  await removeIfExists(stageDir);
  await fs.mkdir(path.dirname(stageDir), { recursive: true });
  await copyStudioBuildOutputToStageDir(stageDir);

  const vendoredWorkspacePackages = await vendorWorkspacePackages({
    workspacePackages,
    vendorDir,
  });
  const installManifest = buildInstallWorkspaceManifest({
    packageJson: studioPackageJson,
    version,
    vendoredWorkspacePackages,
  });

  await fs.writeFile(
    path.join(stageDir, 'package.json'),
    `${JSON.stringify(installManifest, null, 2)}\n`,
  );

  await installStageDependencies(stageDir);
  await removeIfExists(vendorDir);
  await removeIfExists(path.join(stageDir, 'pnpm-lock.yaml'));

  const packagedManifest = buildPackagedAppManifest(
    studioPackageJson,
    version,
    buildResolvedWorkspaceDependencyVersions({
      dependencies: studioPackageJson.dependencies,
      workspacePackages,
    }),
  );
  await fs.writeFile(
    path.join(stageDir, 'package.json'),
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
  const stageDir = path.join(packagingWorkspaceDir, baseName);

  await createPackagingWorkspace({ stageDir, version: normalizedVersion });

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
