import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCoreReportTemplateReplacementPlugin,
  prepareCoreWrapperModules,
  readCoreExportEntries,
  reportTemplateGlobalName,
} from '../../../scripts/rsbuild-utils';

const tempDirs: string[] = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-rsbuild-utils-'));
  tempDirs.push(dir);
  return dir;
}

function createCorePackage(root: string) {
  const corePackageDir = path.join(root, 'packages', 'core');
  fs.mkdirSync(corePackageDir, { recursive: true });
  fs.writeFileSync(
    path.join(corePackageDir, 'package.json'),
    JSON.stringify(
      {
        exports: {
          '.': {
            import: './dist/es/index.mjs',
            require: './dist/lib/index.js',
          },
          './utils': {
            import: './dist/es/utils.mjs',
            require: './dist/lib/utils.js',
          },
          './report': {
            import: './dist/es/report.mjs',
            require: './dist/lib/report.js',
          },
          './cjs-only': {
            require: './dist/lib/cjs-only.js',
          },
        },
      },
      null,
      2,
    ),
  );
  return corePackageDir;
}

function createReportTemplate(root: string, content = '<html>template</html>') {
  const reportTemplatePath = path.join(
    root,
    'apps',
    'report',
    'dist',
    'index.html',
  );
  fs.mkdirSync(path.dirname(reportTemplatePath), { recursive: true });
  fs.writeFileSync(reportTemplatePath, content);
  return reportTemplatePath;
}

function createMockRsbuildApi(action: 'build' | 'dev' = 'build') {
  const beforeCreateCompilerCallbacks: Array<() => void> = [];
  const resolveCallbacks: Array<
    (args: { resolveData: { request: string } }) => void
  > = [];

  return {
    api: {
      context: { action },
      onBeforeCreateCompiler(callback: () => void) {
        beforeCreateCompilerCallbacks.push(callback);
      },
      resolve(callback: (args: { resolveData: { request: string } }) => void) {
        resolveCallbacks.push(callback);
      },
    },
    runBeforeCreateCompiler() {
      for (const callback of beforeCreateCompilerCallbacks) {
        callback();
      }
    },
    resolveRequest(request: string) {
      const resolveData = { request };
      for (const callback of resolveCallbacks) {
        callback({ resolveData });
      }
      return resolveData.request;
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe('rsbuild report template utils', () => {
  it('reads ESM core export entries from package.json', () => {
    const root = createTempDir();
    const corePackageDir = createCorePackage(root);

    expect(readCoreExportEntries(corePackageDir)).toEqual({
      '': 'index.mjs',
      report: 'report.mjs',
      utils: 'utils.mjs',
    });
  });

  it('creates report template bootstrap and core wrapper modules', () => {
    const root = createTempDir();
    const corePackageDir = createCorePackage(root);
    const reportTemplatePath = createReportTemplate(
      root,
      '<html>report template</html>',
    );
    const appDir = path.join(root, 'apps', 'playground');
    const cacheDir = path.join(
      appDir,
      'node_modules',
      '.cache',
      'core-wrapper',
    );

    const result = prepareCoreWrapperModules({
      appDir,
      cacheDir,
      corePackageDir,
      reportTemplatePath,
    });

    expect(result.coreExportEntries).toEqual({
      '': 'index.mjs',
      report: 'report.mjs',
      utils: 'utils.mjs',
    });
    expect(
      fs.readFileSync(path.join(cacheDir, 'report-template.mjs'), 'utf-8'),
    ).toContain(`globalThis.${reportTemplateGlobalName}=`);
    expect(
      fs.readFileSync(path.join(cacheDir, 'index.mjs'), 'utf-8'),
    ).toContain('export { default }');
    expect(fs.existsSync(path.join(cacheDir, 'utils.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, 'report.mjs'))).toBe(true);
  });

  it('rewrites supported @midscene/core requests to wrapper modules', () => {
    const root = createTempDir();
    const corePackageDir = createCorePackage(root);
    const reportTemplatePath = createReportTemplate(root);
    const appDir = path.join(root, 'apps', 'studio');
    const cacheDir = path.join(
      appDir,
      'node_modules',
      '.cache',
      'core-wrapper',
    );
    const mock = createMockRsbuildApi();

    createCoreReportTemplateReplacementPlugin({
      appDir,
      cacheDir,
      corePackageDir,
      reportTemplatePath,
    }).setup(mock.api);

    mock.runBeforeCreateCompiler();

    expect(mock.resolveRequest('@midscene/core')).toBe(
      path.join(cacheDir, 'index.mjs'),
    );
    expect(mock.resolveRequest('@midscene/core/utils')).toBe(
      path.join(cacheDir, 'utils.mjs'),
    );
    expect(mock.resolveRequest('@midscene/core/report')).toBe(
      path.join(cacheDir, 'report.mjs'),
    );
  });

  it('throws a clear error for unsupported core deep imports', () => {
    const root = createTempDir();
    const corePackageDir = createCorePackage(root);
    const reportTemplatePath = createReportTemplate(root);
    const appDir = path.join(root, 'apps', 'studio');
    const cacheDir = path.join(
      appDir,
      'node_modules',
      '.cache',
      'core-wrapper',
    );
    const mock = createMockRsbuildApi();

    createCoreReportTemplateReplacementPlugin({
      appDir,
      cacheDir,
      corePackageDir,
      reportTemplatePath,
    }).setup(mock.api);

    expect(() => mock.resolveRequest('@midscene/core/cjs-only')).toThrow(
      'Unsupported @midscene/core deep import for report template replacement: @midscene/core/cjs-only',
    );
  });

  it('throws a clear error when the report template is missing', () => {
    const root = createTempDir();
    const corePackageDir = createCorePackage(root);
    const appDir = path.join(root, 'apps', 'studio');
    const cacheDir = path.join(
      appDir,
      'node_modules',
      '.cache',
      'core-wrapper',
    );
    const missingReportTemplatePath = path.join(
      root,
      'apps',
      'report',
      'dist',
      'index.html',
    );
    const mock = createMockRsbuildApi();

    createCoreReportTemplateReplacementPlugin({
      appDir,
      cacheDir,
      corePackageDir,
      reportTemplatePath: missingReportTemplatePath,
    }).setup(mock.api);

    expect(() => mock.runBeforeCreateCompiler()).toThrow(
      `Report template not found: ${missingReportTemplatePath}. Build @midscene/report before bundling this target.`,
    );
  });
});
