import fs from 'node:fs';
import path from 'node:path';

export interface CopyStaticOptions {
  srcDir: string;
  destDir: string;
  faviconPath?: string;
  pluginName?: string;
}

export const commonIgnoreWarnings = [
  /Critical dependency: the request of a dependency is an expression/,
];

export const createCopyStaticPlugin = (options: CopyStaticOptions) => ({
  name: options.pluginName || 'copy-static',
  setup(api: any) {
    api.onAfterBuild(async () => {
      const { srcDir, destDir, faviconPath } = options;

      const stat = await fs.promises.lstat(destDir).catch(() => null);
      if (stat?.isSymbolicLink()) {
        await fs.promises.unlink(destDir);
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
