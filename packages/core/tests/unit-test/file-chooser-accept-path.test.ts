import { unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Agent } from '@/agent';
import { normalizeFilePaths } from '@/agent/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

const fixturesDir = join(__dirname, '../fixtures');
const testFilePath = join(fixturesDir, 'path-test-file.txt');
const hadWslDistroName = Object.prototype.hasOwnProperty.call(
  process.env,
  'WSL_DISTRO_NAME',
);
const originalWslDistroName = process.env.WSL_DISTRO_NAME;

// resolve() resolves based on process.cwd(), compute fixture path relative to cwd
const relativeFromCwd = relative(process.cwd(), testFilePath);

describe('fileChooserAccept relative path support', () => {
  let agent: Agent;

  beforeAll(() => {
    Reflect.deleteProperty(process.env, 'WSL_DISTRO_NAME');
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

    if (hadWslDistroName) {
      process.env.WSL_DISTRO_NAME = originalWslDistroName;
    } else {
      Reflect.deleteProperty(process.env, 'WSL_DISTRO_NAME');
    }
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
    // Build a path containing ../: tests/fixtures/../fixtures/path-test-file.txt
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
    }).toThrow(
      new RegExp(
        `File not found: \\./non-existent-file\\.txt\\. Resolved to: .*non-existent-file\\.txt\\. Current working directory: ${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ),
    );
  });

  it('should reject image upload with non-existent relative path before tap runs', async () => {
    await expect(
      agent.aiTap('Upload images', {
        fileChooserAccept: './tests/ai/fixtures/missing-upload-image.png',
      }),
    ).rejects.toThrow(
      new RegExp(
        `File not found: \\./tests/ai/fixtures/missing-upload-image\\.png\\. Resolved to: .*missing-upload-image\\.png\\. Current working directory: ${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ),
    );
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

describe('normalizeFilePaths', () => {
  it('throws in browser environments', () => {
    expect(() =>
      normalizeFilePaths(['file.txt'], { isInBrowser: true }),
    ).toThrow('File chooser is not supported in browser environment');
  });

  it('resolves relative paths and validates existence', () => {
    const result = normalizeFilePaths(['./upload.txt'], {
      fileExists: (filePath) => filePath === '/project/upload.txt',
      resolvePath: () => '/project/upload.txt',
      wslDistroName: '',
    });

    expect(result).toEqual(['/project/upload.txt']);
  });

  it('throws with the original and resolved paths when a file does not exist', () => {
    expect(() =>
      normalizeFilePaths(['./missing.txt'], {
        cwd: '/project',
        fileExists: () => false,
        resolvePath: () => '/project/missing.txt',
      }),
    ).toThrow(
      'File not found: ./missing.txt. Resolved to: /project/missing.txt. Current working directory: /project',
    );
  });

  it('converts WSL mounted Windows drive paths for Windows Chrome', () => {
    const result = normalizeFilePaths(['/mnt/c/Users/me/upload.zip'], {
      fileExists: () => true,
      resolvePath: (filePath) => filePath,
      wslDistroName: 'Ubuntu-22.04',
    });

    expect(result).toEqual(['C:\\Users\\me\\upload.zip']);
  });

  it('converts WSL distro-local paths to UNC paths for Windows Chrome', () => {
    const result = normalizeFilePaths(['/home/me/upload.zip'], {
      fileExists: () => true,
      resolvePath: (filePath) => filePath,
      wslDistroName: 'Ubuntu-22.04',
    });

    expect(result).toEqual(['\\\\wsl$\\Ubuntu-22.04\\home\\me\\upload.zip']);
  });
});
