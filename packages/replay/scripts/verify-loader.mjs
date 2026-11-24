import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let manifest;
export function initialize(data) {
  manifest = data;
}
const local = (url) => {
  if (!url?.startsWith('file:')) return undefined;
  const rel = relative(manifest.destination, fileURLToPath(url));
  return rel &&
    rel !== '..' &&
    !rel.startsWith(`..${sep}`) &&
    !rel.startsWith(sep)
    ? rel.split(sep).join('/')
    : undefined;
};
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  // Relative local imports must be frozen too. Dependencies may import their own files.
  if (
    local(context.parentURL) &&
    (specifier.startsWith('.') ||
      specifier.startsWith('/') ||
      specifier.startsWith('file:') ||
      specifier.startsWith('#')) &&
    !local(resolved.url)
  )
    throw new Error(
      `VERIFY_IMPORT_OUTSIDE_INPUTS: ${specifier} from ${context.parentURL}`,
    );
  return resolved;
}
export async function load(url, context, nextLoad) {
  const file = local(url);
  if (file && !file.startsWith('node_modules/')) {
    const hash = createHash('sha256')
      .update(readFileSync(fileURLToPath(url)))
      .digest('hex');
    if (manifest.files[file] !== hash)
      throw new Error(`VERIFY_INPUTS_CHANGED: ${file}`);
  }
  return nextLoad(url, context);
}

// Config/fixture loaders can use require(). Apply the same reproducibility
// boundary there; arbitrary fs/network access is deliberately not sandboxed.
export function guardCommonJs(inputs) {
  manifest = inputs;
  const original = Module._resolveFilename;
  Module._resolveFilename = function (specifier, parent, ...args) {
    const resolved = original.call(this, specifier, parent, ...args);
    const fromInput =
      parent?.filename && local(pathToFileURL(parent.filename).href);
    if (
      fromInput &&
      (specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('#')) &&
      !local(pathToFileURL(resolved).href)
    )
      throw new Error(
        `VERIFY_IMPORT_OUTSIDE_INPUTS: ${specifier} from ${parent.filename}`,
      );
    if (resolved.startsWith('/')) {
      const file = local(pathToFileURL(resolved).href);
      if (
        file &&
        !file.startsWith('node_modules/') &&
        createHash('sha256').update(readFileSync(resolved)).digest('hex') !==
          manifest.files[file]
      )
        throw new Error(`VERIFY_INPUTS_CHANGED: ${file}`);
    }
    return resolved;
  };
}
