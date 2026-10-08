import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface TemplateEntry {
  id: string;
  sourceDir: string;
  examplePath: string;
  projectName: string;
  exposure: 'create' | 'example-only';
  platform?: string;
  verification: string;
  referenceCase?: string;
  referenceCommit?: string;
}

export interface TemplateManifest {
  schemaVersion: 1;
  templates: TemplateEntry[];
}

/** Manifest paths are portable relative paths, never paths supplied by a CLI user. */
function checkedPath(path: string, label: string): string {
  if (
    !path ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    path.startsWith('/') ||
    path.includes(':')
  ) {
    throw new Error(`Invalid ${label}: ${path}`);
  }
  return path;
}

export function loadTemplateManifest(catalogRoot: string): TemplateManifest {
  const manifest = JSON.parse(
    readFileSync(join(catalogRoot, 'manifest.json'), 'utf8'),
  ) as TemplateManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.templates)) {
    throw new Error('Unsupported template manifest schema.');
  }
  const ids = new Set<string>();
  const destinations: string[] = [];
  for (const entry of manifest.templates) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.sourceDir !== 'string' ||
      typeof entry.examplePath !== 'string' ||
      typeof entry.projectName !== 'string' ||
      !['create', 'example-only'].includes(entry.exposure) ||
      typeof entry.verification !== 'string'
    ) {
      throw new Error('Invalid template manifest entry.');
    }
    checkedPath(entry.id, 'template id');
    checkedPath(entry.sourceDir, 'template source');
    checkedPath(entry.examplePath, 'example destination');
    if (
      (entry.referenceCase === undefined) !==
      (entry.referenceCommit === undefined)
    ) {
      throw new Error(`Incomplete reference case for template ${entry.id}.`);
    }
    if (entry.referenceCase !== undefined) {
      checkedPath(entry.referenceCase, 'reference case');
      if (!/^[0-9a-f]{40}$/.test(entry.referenceCommit ?? '')) {
        throw new Error(`Invalid reference commit for template ${entry.id}.`);
      }
    }
    if (ids.has(entry.id))
      throw new Error(`Duplicate template id: ${entry.id}`);
    if (
      destinations.some(
        (path) =>
          path === entry.examplePath ||
          path.startsWith(`${entry.examplePath}/`) ||
          entry.examplePath.startsWith(`${path}/`),
      )
    ) {
      throw new Error(`Overlapping example destination: ${entry.examplePath}`);
    }
    ids.add(entry.id);
    destinations.push(entry.examplePath);
  }
  return manifest;
}

export function renderTemplate(
  catalogRoot: string,
  entry: TemplateEntry,
  variables: Record<string, string>,
): Record<string, Buffer> {
  const source = resolve(
    catalogRoot,
    checkedPath(entry.sourceDir, 'template source'),
  );
  let segment = catalogRoot;
  for (const part of entry.sourceDir.split('/')) {
    segment = join(segment, part);
    if (lstatSync(segment).isSymbolicLink()) {
      throw new Error(
        `Template source contains a symbolic link: ${entry.sourceDir}`,
      );
    }
  }
  if (!lstatSync(source).isDirectory()) {
    throw new Error(`Template is not a directory: ${entry.sourceDir}`);
  }
  const files: Record<string, Buffer> = {};
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const visit = (directory: string, prefix: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        throw new Error(`Template contains a symbolic link: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        visit(path, relativePath);
      } else if (stat.isFile()) {
        const data = readFileSync(path);
        let content: string;
        try {
          content = decoder.decode(data);
        } catch {
          files[relativePath] = data;
          continue;
        }
        files[relativePath] = Buffer.from(
          content.replace(/\{\{([A-Z_]+)\}\}/g, (_token, key: string) => {
            if (!Object.hasOwn(variables, key)) {
              throw new Error(
                `Unknown template variable ${key} in ${relativePath}`,
              );
            }
            return variables[key];
          }),
        );
      } else {
        throw new Error(`Unsupported template file: ${relativePath}`);
      }
    }
  };
  visit(source, '');
  if (!Object.keys(files).length) {
    throw new Error(`Template has no files: ${entry.id}`);
  }
  return files;
}
