import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isIndexYamlFile, matchYamlFiles } from '@/cli-utils';
import { launchServer } from '@/create-yaml-player';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
const serverRoot = join(__dirname, '../server_root');

describe('matchYamlFiles', () => {
  test('match exact file', async () => {
    const files = await matchYamlFiles(
      './tests/midscene_scripts/local/local.yml',
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/tests\/midscene_scripts\/local\/local\.yml$/);
  });

  let files: string[];
  test('match folder', async () => {
    files = await matchYamlFiles('./tests/midscene_scripts/');
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.every((file) => file.endsWith('.yml') || file.endsWith('.yaml')),
    ).toBe(true);
  });

  test('match folder 2', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts');
    expect(files2).toEqual(files);
  });

  test('match folder with star', async () => {
    const files2 = await matchYamlFiles('./tests/midscene_scripts/**');
    expect(files2).toEqual(files);
  });

  test('match files', async () => {
    const files3 = await matchYamlFiles('./tests/midscene_scripts/**/*.yml');
    expect(files3.length).toBeGreaterThan(0);
    expect(
      files3.every((file) => file.endsWith('.yml') || file.endsWith('.yaml')),
    ).toBe(true);
  });
});

describe('isIndexYamlFile', () => {
  const testDir = join(__dirname, '../test_yaml_files');

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  test('should return true for file with order array', () => {
    const indexYamlContent = `
order:
  - file1.yml
  - file2.yml
`;
    const indexYamlPath = join(testDir, 'index.yml');
    writeFileSync(indexYamlPath, indexYamlContent);

    expect(isIndexYamlFile(indexYamlPath)).toBe(true);
  });

  test('should return false for file without order field', () => {
    const normalYamlContent = `
target:
  serve: ./tests/server_root
  url: index.html
tasks:
  - name: check title
    flow:
      - aiAssert: the content title is "My App"
`;
    const normalYamlPath = join(testDir, 'normal.yml');
    writeFileSync(normalYamlPath, normalYamlContent);

    expect(isIndexYamlFile(normalYamlPath)).toBe(false);
  });

  test('should return false for file with order field but not array', () => {
    const invalidYamlContent = `
order: "not-an-array"
`;
    const invalidYamlPath = join(testDir, 'invalid.yml');
    writeFileSync(invalidYamlPath, invalidYamlContent);

    expect(isIndexYamlFile(invalidYamlPath)).toBe(false);
  });

  test('should return false for non-existent file', () => {
    const nonExistentPath = join(testDir, 'non-existent.yml');
    expect(isIndexYamlFile(nonExistentPath)).toBe(false);
  });

  test('should return false for invalid YAML file', () => {
    const invalidYamlContent = `
invalid: yaml: content: [
`;
    const invalidYamlPath = join(testDir, 'invalid-yaml.yml');
    writeFileSync(invalidYamlPath, invalidYamlContent);

    expect(isIndexYamlFile(invalidYamlPath)).toBe(false);
  });

  test('should return false for file with empty order array', () => {
    const emptyOrderYamlContent = `
order: []
`;
    const emptyOrderYamlPath = join(testDir, 'empty-order.yml');
    writeFileSync(emptyOrderYamlPath, emptyOrderYamlContent);

    expect(isIndexYamlFile(emptyOrderYamlPath)).toBe(true);
  });

  test('should return false for file with order field as null', () => {
    const nullOrderYamlContent = `
order: null
`;
    const nullOrderYamlPath = join(testDir, 'null-order.yml');
    writeFileSync(nullOrderYamlPath, nullOrderYamlContent);

    expect(isIndexYamlFile(nullOrderYamlPath)).toBe(false);
  });
});

describe('launch server', () => {
  test('launch server', async () => {
    const serverResult = await launchServer(serverRoot);
    expect(serverResult).toBeDefined();

    const serverAddress = serverResult.server.address();
    const staticServerUrl = `http://${serverAddress?.address}:${serverAddress?.port}`;

    const contents = await fetch(`${staticServerUrl}/index.html`);
    expect(contents.status).toBe(200);

    await serverResult.server.close();
  });
});
