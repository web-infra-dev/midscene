import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_OWNER = 'web-infra-dev';
const GITHUB_REPO = 'midscene';
const UPDATER_CACHE_DIR_NAME = 'midscene-studio-updater';

const PRERELEASE_TOKEN_RE = /[-.](alpha|beta|rc)([-.\d]|$)/i;

const platformYmlName = {
  darwin: 'latest-mac.yml',
  linux: 'latest-linux.yml',
  win32: 'latest.yml',
};

const platformBetaYmlName = {
  darwin: 'beta-mac.yml',
  linux: 'beta-linux.yml',
  win32: 'beta.yml',
};

const stringifyYml = (data) => {
  const lines = [`version: ${data.version}`];
  lines.push('files:');
  for (const file of data.files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
  }
  lines.push(`path: ${data.path}`);
  lines.push(`sha512: ${data.sha512}`);
  lines.push(`releaseDate: '${data.releaseDate}'`);
  return `${lines.join('\n')}\n`;
};

export const isPrereleaseVersion = (version) =>
  PRERELEASE_TOKEN_RE.test(version);

export const buildLatestYmlForPlatform = ({
  version,
  platform,
  artifactName,
  sha512,
  size,
  releaseDate = new Date().toISOString(),
}) => {
  if (!platformYmlName[platform]) {
    throw new Error(`Unsupported platform for updater metadata: ${platform}`);
  }
  return stringifyYml({
    version,
    files: [
      {
        url: artifactName,
        sha512,
        size,
      },
    ],
    path: artifactName,
    sha512,
    releaseDate,
  });
};

const hashFile = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha512').update(buffer).digest('base64');
  return { sha512: hash, size: buffer.length };
};

export const writeUpdateMetadataForArtifact = async ({
  artifactPath,
  artifactDir,
  platform,
  version,
}) => {
  const { sha512, size } = await hashFile(artifactPath);
  const artifactName = path.basename(artifactPath);
  const releaseDate = new Date().toISOString();

  const stableYmlName = platformYmlName[platform];
  if (!stableYmlName) {
    throw new Error(`Unsupported platform for updater metadata: ${platform}`);
  }
  const yml = buildLatestYmlForPlatform({
    version,
    platform,
    artifactName,
    sha512,
    size,
    releaseDate,
  });

  await fs.mkdir(artifactDir, { recursive: true });

  const stablePath = path.join(artifactDir, stableYmlName);
  await fs.writeFile(stablePath, yml);

  const writtenPaths = [stablePath];

  // Beta channel readers fetch beta-<platform>.yml; mirror the manifest
  // there too so prerelease builds reach beta users automatically. Stable
  // readers stay on `latest-*.yml` and ignore beta versions because the
  // updater also reads the prerelease flag from the GitHub release.
  if (isPrereleaseVersion(version)) {
    const betaName = platformBetaYmlName[platform];
    if (betaName) {
      const betaPath = path.join(artifactDir, betaName);
      await fs.writeFile(betaPath, yml);
      writtenPaths.push(betaPath);
    }
  }

  return { sha512, size, writtenPaths };
};

export const buildAppUpdateYml = () => {
  const lines = [
    'provider: github',
    `owner: ${GITHUB_OWNER}`,
    `repo: ${GITHUB_REPO}`,
    `updaterCacheDirName: ${UPDATER_CACHE_DIR_NAME}`,
  ];
  return `${lines.join('\n')}\n`;
};

export const writeAppUpdateYmlIntoResources = async (resourcesDir) => {
  await fs.mkdir(resourcesDir, { recursive: true });
  const targetPath = path.join(resourcesDir, 'app-update.yml');
  await fs.writeFile(targetPath, buildAppUpdateYml());
  return targetPath;
};

export const __testing__ = {
  hashFile,
  platformYmlName,
  platformBetaYmlName,
};
