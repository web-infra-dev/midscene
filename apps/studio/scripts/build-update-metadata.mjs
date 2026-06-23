import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_OWNER = 'web-infra-dev';
const GITHUB_REPO = 'midscene';
const UPDATER_CACHE_DIR_NAME = 'midscene-studio-beta-updater';

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

// We hand-roll the YAML because the manifest schema is fixed and tiny.
// To keep that safe, we reject any string scalar that contains characters
// requiring escaping in unquoted YAML — versions, sha512 base64, and file
// names all stay inside `[A-Za-z0-9._\-/+=]` in practice, so a surprise
// character means an upstream caller is passing untrusted input and the
// manifest would silently parse wrong.
const SAFE_YAML_SCALAR = /^[A-Za-z0-9._\-/+=]+$/;

const assertSafeYamlScalar = (value, field) => {
  if (typeof value !== 'string') {
    throw new Error(
      `Updater metadata field ${field} must be a string (got ${typeof value})`,
    );
  }
  if (!SAFE_YAML_SCALAR.test(value)) {
    throw new Error(
      `Updater metadata field ${field} contains unsafe YAML characters: ${JSON.stringify(value)}`,
    );
  }
};

const assertSafeReleaseDate = (value) => {
  if (typeof value !== 'string') {
    throw new Error(
      `Updater metadata field releaseDate must be a string (got ${typeof value})`,
    );
  }
  // releaseDate is wrapped in single quotes; reject only the two
  // characters that would break that quoting.
  if (value.includes("'") || /[\r\n]/.test(value)) {
    throw new Error(
      `Updater metadata field releaseDate contains unsafe characters: ${JSON.stringify(value)}`,
    );
  }
};

const stringifyYml = (data) => {
  assertSafeYamlScalar(data.version, 'version');
  assertSafeYamlScalar(data.path, 'path');
  assertSafeYamlScalar(data.sha512, 'sha512');
  assertSafeReleaseDate(data.releaseDate);
  for (let i = 0; i < data.files.length; i += 1) {
    const file = data.files[i];
    assertSafeYamlScalar(file.url, `files[${i}].url`);
    assertSafeYamlScalar(file.sha512, `files[${i}].sha512`);
    if (!Number.isInteger(file.size) || file.size < 0) {
      throw new Error(
        `Updater metadata field files[${i}].size must be a non-negative integer (got ${file.size})`,
      );
    }
  }

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
