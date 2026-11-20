import { mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import envPaths from 'env-paths';
import { version } from '../../../package.json';

const name = '@midscene/benchmark-grounding';
const downloads = new Map<string, Promise<string>>();

async function datasetTestcases(directory: string) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  );
  if (manifest.name !== name || manifest.version !== version)
    throw new Error(`Expected dataset ${name}@${version} in ${directory}`);
  const testcases = path.join(directory, 'testcases');
  if (!(await stat(testcases)).isDirectory())
    throw new Error(`Dataset testcase directory is missing: ${testcases}`);
  return testcases;
}

/** Reuse the versioned cache or fetch the matching npm release. */
export async function resolveDatasetDirectory(
  onStatus?: (message: string) => void,
): Promise<string> {
  const cache = envPaths('midscene').cache;
  const directory = path.join(cache, 'benchmark-grounding', version);
  const exists = await stat(directory).then(
    () => true,
    (cause: NodeJS.ErrnoException) => {
      if (cause.code !== 'ENOENT') throw cause;
      return false;
    },
  );
  if (exists) {
    onStatus?.(`Using cached dataset ${name}@${version}: ${directory}`);
    return datasetTestcases(directory);
  }
  if (!downloads.has(directory)) {
    downloads.set(
      directory,
      (async () => {
        onStatus?.(`Downloading dataset ${name}@${version} to ${directory}...`);
        await mkdir(path.dirname(directory), { recursive: true });
        const temporary = await mkdtemp(`${directory}-`);
        try {
          const { default: pacote } = await import('pacote');
          await pacote.extract(`${name}@${version}`, temporary, {
            cache: path.join(cache, 'npm'),
          });
          await datasetTestcases(temporary);
          // Another process may finish first; only complete directories are shared.
          await rename(temporary, directory).catch(
            async (cause: NodeJS.ErrnoException) => {
              if (!['EEXIST', 'ENOTEMPTY'].includes(cause.code ?? ''))
                throw cause;
              await datasetTestcases(directory);
            },
          );
          onStatus?.(`Dataset downloaded: ${directory}`);
          return path.join(directory, 'testcases');
        } catch (cause) {
          throw new Error(
            `Cannot download dataset ${name}@${version}: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
          );
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      })().finally(() => downloads.delete(directory)),
    );
  }
  return downloads.get(directory)!;
}
