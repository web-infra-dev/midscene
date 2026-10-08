import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type TemplateEntry,
  loadTemplateManifest,
  renderTemplate,
} from '../src/cli/template-renderer';

const directories: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-template-'));
  directories.push(root);
  mkdirSync(join(root, 'test/web'), { recursive: true });
  return root;
};
const entry: TemplateEntry = {
  id: 'test-web',
  sourceDir: 'test/web',
  examplePath: 'midscene-test-runner-demo',
  projectName: 'midscene-test-web',
  exposure: 'create',
  platform: 'web',
  verification: 'web',
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('template catalog', () => {
  it('renders the real Web TodoMVC starter without unresolved variables', () => {
    const catalog = resolve(__dirname, '../../../examples/catalog');
    const manifest = loadTemplateManifest(catalog);
    expect(
      manifest.templates.filter((item) => item.exposure === 'create'),
    ).toHaveLength(5);
    const web = manifest.templates.find((item) => item.id === 'test-web')!;
    const files = renderTemplate(catalog, web, {
      PROJECT_NAME: 'my-web-tests',
      MIDSCENE_VERSION: '1.13.3',
      INSTALL_COMMAND: 'pnpm install',
      RUN_NODES_COMMAND: 'pnpm run nodes',
      TEST_COMMAND: 'pnpm test',
      CHROMIUM_INSTALL_COMMAND: 'pnpm exec playwright install chromium',
    });
    expect(files['cases/todo.yaml'].toString()).toContain('todo.seed');
    expect(files['cases/todo.yaml'].toString()).toContain('todo.expectState');
    expect(files['cases/todo.yaml'].toString()).toContain('todomvc.com');
    expect(files['nodes/todo.ts'].toString()).toContain('todo.captureState');
    expect(files['public/todo.html']).toBeUndefined();
    expect(web.examplePath).toBe('midscene-test-runner-demo');
    expect(web.referenceCase).toBe('midscene-test-runner-demo/cases/todo.yaml');
    expect(JSON.parse(files['package.json'].toString()).name).toBe(
      'my-web-tests',
    );
    for (const data of Object.values(files)) {
      expect(data.toString()).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it('rejects unsafe and overlapping manifest paths', () => {
    const root = fixture();
    const write = (templates: TemplateEntry[]) =>
      writeFileSync(
        join(root, 'manifest.json'),
        JSON.stringify({ schemaVersion: 1, templates }),
      );
    write([{ ...entry, sourceDir: '../outside' }]);
    expect(() => loadTemplateManifest(root)).toThrow('Invalid template source');
    write([entry, { ...entry, id: 'second', examplePath: 'midscene-test' }]);
    expect(loadTemplateManifest(root).templates).toHaveLength(2);
    write([
      entry,
      {
        ...entry,
        id: 'second',
        examplePath: 'midscene-test-runner-demo/subdir',
      },
    ]);
    expect(() => loadTemplateManifest(root)).toThrow(
      'Overlapping example destination',
    );
    write([
      {
        ...entry,
        referenceCase: '../outside',
        referenceCommit: 'a'.repeat(40),
      },
    ]);
    expect(() => loadTemplateManifest(root)).toThrow('Invalid reference case');
  });

  it('rejects template symlinks and unknown variables', () => {
    const root = fixture();
    writeFileSync(join(root, 'test/web/file.txt'), '{{MISSING}}');
    expect(() => renderTemplate(root, entry, {})).toThrow(
      'Unknown template variable MISSING',
    );
    writeFileSync(join(root, 'test/web/file.txt'), 'plain text');
    symlinkSync(
      join(root, 'test/web/file.txt'),
      join(root, 'test/web/link.txt'),
    );
    expect(() => renderTemplate(root, entry, {})).toThrow(
      'Template contains a symbolic link',
    );
  });
});
