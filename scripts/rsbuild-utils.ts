import fs from 'node:fs';
import path from 'node:path';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

export interface CopyStaticOptions {
  srcDir: string;
  destDir: string;
  faviconPath?: string;
  pluginName?: string;
}

export interface ReportTemplateInjectOptions {
  appDir: string;
  cacheDir?: string;
  corePackageDir?: string;
  enabledIn?: 'build' | 'dev' | 'both';
  pluginName?: string;
  reportTemplatePath?: string;
}

export interface ReportTemplateSyncOptions {
  srcPath: string;
  destPath: string;
  pluginName?: string;
}

export const reportTemplateGlobalName =
  '__MIDSCENE_INTERNAL_REPORT_TEMPLATE_CONTENT__';
export const reportTemplateInjectionMarker =
  '/*MIDSCENE_REPORT_TEMPLATE_CONTENT*/';

export const commonIgnoreWarnings = [
  /Critical dependency: the request of a dependency is an expression/,
];

export const createTypeCheckPlugin = () =>
  pluginTypeCheck({
    tsCheckerOptions: {
      typescript: {
        // Keep type checking scoped to the current project instead of letting
        // TypeScript build mode follow the project references graph.
        build: false,
      },
    },
  });

type CoreExportEntries = Record<string, string>;

const coreRequestRegExp = /^@midscene\/core(?:\/(.+))?$/;

const toImportSpecifier = (specifierPath: string) =>
  specifierPath.split(path.sep).join('/');

const toRelativeImportSpecifier = (fromDir: string, toPath: string) => {
  const relativePath = toImportSpecifier(path.relative(fromDir, toPath));
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const wrapperFileName = (subpath: string) =>
  subpath ? `${subpath.replace(/\//g, '__')}.mjs` : 'index.mjs';

const createCoreWrapperModule = ({
  coreModulePath,
  wrapperDir,
  hasDefaultExport,
}: {
  coreModulePath: string;
  wrapperDir: string;
  hasDefaultExport: boolean;
}) => {
  const coreImportSpecifier = toRelativeImportSpecifier(
    wrapperDir,
    coreModulePath,
  );
  return [
    "import './report-template.mjs';",
    `export * from '${coreImportSpecifier}';`,
    hasDefaultExport ? `export { default } from '${coreImportSpecifier}';` : '',
    '',
  ].join('\n');
};

export const readCoreExportEntries = (
  corePackageDir: string,
): CoreExportEntries => {
  const packageJsonPath = path.join(corePackageDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
    exports?: Record<string, { import?: string } | string>;
  };
  const entries: CoreExportEntries = {};

  for (const [exportPath, exportConfig] of Object.entries(
    packageJson.exports || {},
  )) {
    const importPath =
      typeof exportConfig === 'string' ? exportConfig : exportConfig.import;
    if (!importPath?.startsWith('./dist/es/')) {
      continue;
    }

    const subpath = exportPath === '.' ? '' : exportPath.replace(/^\.\//, '');
    entries[subpath] = importPath.slice('./dist/es/'.length);
  }

  if (!Object.keys(entries).length) {
    throw new Error(
      `No ESM exports found in @midscene/core package.json: ${packageJsonPath}`,
    );
  }

  return entries;
};

export const prepareCoreWrapperModules = ({
  appDir,
  cacheDir,
  corePackageDir,
  reportTemplatePath,
}: Required<
  Pick<
    ReportTemplateInjectOptions,
    'appDir' | 'cacheDir' | 'corePackageDir' | 'reportTemplatePath'
  >
>) => {
  if (!fs.existsSync(reportTemplatePath)) {
    throw new Error(
      `Report template not found: ${reportTemplatePath}. Build @midscene/report before bundling this target.`,
    );
  }

  const templateContent = fs.readFileSync(reportTemplatePath, 'utf-8');
  if (!templateContent.trim()) {
    throw new Error(`Report template is empty: ${reportTemplatePath}`);
  }

  const coreExportEntries = readCoreExportEntries(corePackageDir);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'report-template.mjs'),
    // If this is ever written into an inline HTML script, escape `</script>`.
    `${reportTemplateInjectionMarker}globalThis.${reportTemplateGlobalName}=${JSON.stringify(
      templateContent,
    )};\n`,
  );

  for (const [subpath, modulePath] of Object.entries(coreExportEntries)) {
    fs.writeFileSync(
      path.join(cacheDir, wrapperFileName(subpath)),
      createCoreWrapperModule({
        coreModulePath: path.join(corePackageDir, 'dist', 'es', modulePath),
        wrapperDir: cacheDir,
        hasDefaultExport: subpath === '',
      }),
    );
  }

  return {
    cacheDir,
    coreExportEntries,
    reportTemplatePath,
    relativeCacheDir: path.relative(appDir, cacheDir) || '.',
  };
};

export const createCoreReportTemplateReplacementPlugin = ({
  appDir,
  cacheDir,
  corePackageDir,
  enabledIn = 'build',
  pluginName = 'replace-core-with-report-template',
  reportTemplatePath,
}: ReportTemplateInjectOptions) => ({
  name: pluginName,
  setup(api: any) {
    // This plugin only consumes the report template build output. It does not
    // build @midscene/report; configure bundle targets to build it first.
    const isEnabled = () => {
      const isDev = api.context?.action === 'dev';
      return enabledIn === 'both' || (enabledIn === 'dev') === isDev;
    };
    const resolvedAppDir = appDir;
    const workspaceRoot = path.resolve(resolvedAppDir, '..', '..');
    const resolvedCacheDir =
      cacheDir ||
      path.join(
        resolvedAppDir,
        'node_modules',
        '.cache',
        'midscene-report-template',
        'core-wrapper',
      );
    const resolvedCorePackageDir =
      corePackageDir || path.join(workspaceRoot, 'packages', 'core');
    const resolvedReportTemplatePath =
      reportTemplatePath ||
      path.join(workspaceRoot, 'apps', 'report', 'dist', 'index.html');

    let prepared: ReturnType<typeof prepareCoreWrapperModules> | undefined;
    const ensurePrepared = () => {
      prepared ||= prepareCoreWrapperModules({
        appDir: resolvedAppDir,
        cacheDir: resolvedCacheDir,
        corePackageDir: resolvedCorePackageDir,
        reportTemplatePath: resolvedReportTemplatePath,
      });
      return prepared;
    };

    api.onBeforeCreateCompiler(() => {
      if (!isEnabled()) {
        return;
      }

      const result = ensurePrepared();
      console.log(
        `Prepared Midscene core report template wrappers under ${result.relativeCacheDir}`,
      );
    });

    api.resolve(({ resolveData }: any) => {
      if (!isEnabled()) {
        return;
      }

      const match = coreRequestRegExp.exec(resolveData.request);
      if (!match) {
        return;
      }

      const subpath = match[1] || '';
      if (!(subpath in ensurePrepared().coreExportEntries)) {
        throw new Error(
          `Unsupported @midscene/core deep import for report template replacement: ${resolveData.request}`,
        );
      }

      resolveData.request = path.join(
        ensurePrepared().cacheDir,
        wrapperFileName(subpath),
      );
    });
  },
});

export const createReportTemplateSyncPlugin = ({
  srcPath,
  destPath,
  pluginName = 'sync-report-template',
}: ReportTemplateSyncOptions) => ({
  name: pluginName,
  setup(api: any) {
    api.onAfterBuild(async () => {
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Report template source is missing: ${srcPath}`);
      }

      const content = await fs.promises.readFile(srcPath, 'utf-8');
      if (!content.trim()) {
        throw new Error(`Report template is empty: ${srcPath}`);
      }

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.copyFile(srcPath, destPath);
      console.log(
        `Synced Midscene report template from ${srcPath} to ${destPath}`,
      );
    });
  },
});

export const createCopyStaticPlugin = (options: CopyStaticOptions) => ({
  name: options.pluginName || 'copy-static',
  setup(api: any) {
    api.onAfterBuild(async () => {
      const { srcDir, destDir, faviconPath } = options;

      const stat = await fs.promises.lstat(destDir).catch(() => null);
      if (stat?.isSymbolicLink()) {
        await fs.promises.unlink(destDir);
      } else if (stat) {
        await fs.promises.rm(destDir, { recursive: true, force: true });
      }

      await fs.promises.mkdir(destDir, { recursive: true });
      await fs.promises.cp(srcDir, destDir, { recursive: true });
      console.log(`Copied build artifacts from ${srcDir} to ${destDir}`);

      if (faviconPath) {
        const faviconDest = path.join(destDir, 'favicon.ico');
        await fs.promises.copyFile(faviconPath, faviconDest);
        console.log(`Copied favicon from ${faviconPath} to ${faviconDest}`);
      }
    });
  },
});

export const createPlaygroundCopyPlugin = (
  srcDir: string,
  destDir: string,
  pluginName?: string,
  faviconSrc?: string,
) => {
  return createCopyStaticPlugin({
    srcDir,
    destDir,
    faviconPath: faviconSrc,
    pluginName,
  });
};
