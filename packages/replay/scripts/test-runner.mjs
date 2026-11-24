import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadTest(root = process.cwd()) {
  let entry;
  try {
    entry = createRequire(join(root, 'package.json')).resolve(
      '@midscene/test/config',
    );
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    try {
      entry = createRequire(import.meta.url).resolve('@midscene/test/config');
    } catch {
      throw new Error(
        'Install @midscene/test alongside @midscene/replay to use prepare-step or verify.',
      );
    }
  }
  return import(pathToFileURL(entry).href);
}
