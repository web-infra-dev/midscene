import { unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Agent } from '@/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

const fixturesDir = join(__dirname, '../fixtures');
const testFilePath = join(fixturesDir, 'path-test-file.txt');

// resolve() 基于 process.cwd() 解析，计算 fixture 相对于 cwd 的路径
const relativeFromCwd = relative(process.cwd(), testFilePath);

describe('fileChooserAccept relative path support', () => {
  let agent: Agent;

  beforeAll(() => {
    writeFileSync(testFilePath, 'path test content');
    agent = new Agent(createMockInterface(), {
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'test-model',
        MIDSCENE_MODEL_API_KEY: 'test-key',
      },
    });
  });

  afterAll(() => {
    try {
      unlinkSync(testFilePath);
    } catch {}
  });

  it('should resolve relative path with ./ prefix', () => {
    const relativePath = `./${relativeFromCwd}`;
    const result = (agent as any).normalizeFileInput(relativePath);

    expect(result).toEqual([testFilePath]);
  });

  it('should resolve bare relative path (without ./ prefix)', () => {
    const result = (agent as any).normalizeFileInput(relativeFromCwd);

    expect(result).toEqual([testFilePath]);
  });

  it('should resolve relative path with ../', () => {
    // 构造一个包含 ../ 的路径: tests/fixtures/../fixtures/path-test-file.txt
    const parts = relativeFromCwd.split('/');
    const parentDir = parts[parts.length - 2]; // 'fixtures'
    const withDotDot = join(
      ...parts.slice(0, -2),
      parentDir,
      '..',
      parentDir,
      parts[parts.length - 1],
    );
    const result = (agent as any).normalizeFileInput(withDotDot);

    expect(result).toEqual([resolve(withDotDot)]);
    expect(result[0]).toBe(testFilePath);
  });

  it('should keep absolute path as-is', () => {
    const result = (agent as any).normalizeFileInput(testFilePath);

    expect(result).toEqual([testFilePath]);
  });

  it('should accept string input and normalize to array', () => {
    const result = (agent as any).normalizeFileInput(testFilePath);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('should accept array input', () => {
    const result = (agent as any).normalizeFileInput([testFilePath]);

    expect(result).toEqual([testFilePath]);
  });

  it('should throw for non-existent relative path', () => {
    expect(() => {
      (agent as any).normalizeFileInput('./non-existent-file.txt');
    }).toThrow(/File not found/);
  });

  it('should throw for non-existent absolute path', () => {
    expect(() => {
      (agent as any).normalizeFileInput('/absolute/non-existent-file.txt');
    }).toThrow(/File not found/);
  });

  it('should resolve multiple relative paths', () => {
    const result = (agent as any).normalizeFileInput([
      relativeFromCwd,
      testFilePath,
    ]);

    expect(result).toEqual([testFilePath, testFilePath]);
    expect(result.length).toBe(2);
  });
});
