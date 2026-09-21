import fs from 'node:fs/promises';
import path from 'node:path';

const requiredPackagedExternalResources = [
  'node_modules/@midscene/android/bin/scrcpy-server',
  'node_modules/@midscene/android/bin/yadb',
  'node_modules/@midscene/android-playground/bin/scrcpy-server',
];

const packagedExternalResourceDirs = [
  ...new Set(
    requiredPackagedExternalResources.map((resourcePath) =>
      path.posix.dirname(resourcePath),
    ),
  ),
];

const packagedAsarUnpackDirs = [
  'node_modules/@computer-use/libnut',
  'node_modules/@ffmpeg-installer',
  'node_modules/@img',
  ...packagedExternalResourceDirs,
  'node_modules/@midscene/computer/bin',
  'node_modules/@midscene/computer/native',
  'node_modules/sharp',
];

export const packagedAsarOptions = {
  unpack: '**/{.**,**}/**/*.{node,dll,dylib,so,exe}',
  // @electron/asar passes this pattern to minimatch, whose glob syntax uses
  // forward slashes on every platform. Converting these paths to `path.sep`
  // makes backslashes escape the pattern on Windows and silently leaves
  // extensionless helpers such as scrcpy-server inside app.asar.
  unpackDir: `{${packagedAsarUnpackDirs.join(',')}}`,
};

export const assertPackagedExternalResourcesUnpacked = async (resourcesDir) => {
  const unpackedRoot = path.join(resourcesDir, 'app.asar.unpacked');
  const missingResources = [];

  for (const relativePath of requiredPackagedExternalResources) {
    const resourcePath = path.join(unpackedRoot, relativePath);
    try {
      const stats = await fs.stat(resourcePath);
      if (!stats.isFile()) {
        missingResources.push(relativePath);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
      missingResources.push(relativePath);
    }
  }

  if (missingResources.length === 0) {
    return;
  }

  throw new Error(
    [
      'Packaged Midscene Studio app is missing required external resources from app.asar.unpacked:',
      missingResources.join(', '),
      'External processes cannot read these files from the app.asar virtual filesystem.',
    ].join(' '),
  );
};
