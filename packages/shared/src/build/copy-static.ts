import fs from 'node:fs';
import path from 'node:path';

export interface CopyStaticOptions {
  /** Source directory to copy from */
  srcDir: string;
  /** Destination directory to copy to */
  destDir: string;
  /** Optional favicon source path (relative to directory containing srcDir) */
  faviconPath?: string;
  /** Name for the rsbuild plugin */
  pluginName?: string;
}

/**
 * Creates an rsbuild plugin that copies static files after build
 * @param options Configuration options for copying static files
 * @returns Rsbuild plugin object
 */
export const createCopyStaticPlugin = (options: CopyStaticOptions) => ({
  name: options.pluginName || 'copy-static',
  setup(api: any) {
    api.onAfterBuild(async () => {
      const { srcDir, destDir, faviconPath } = options;

      await fs.promises.mkdir(destDir, { recursive: true });

      // Copy directory contents recursively
      await fs.promises.cp(srcDir, destDir, { recursive: true });
      console.log(`Copied build artifacts from ${srcDir} to ${destDir}`);

      // Copy favicon if specified
      if (faviconPath) {
        const faviconDest = path.join(destDir, 'favicon.ico');
        await fs.promises.copyFile(faviconPath, faviconDest);
        console.log(`Copied favicon from ${faviconPath} to ${faviconDest}`);
      }
    });
  },
});

/**
 * Helper function to create a copy static plugin for playground builds
 * @param srcDir Source directory (usually dist directory)
 * @param destDir Destination directory
 * @param pluginName Optional plugin name
 * @param faviconSrc Optional favicon source path
 * @returns Rsbuild plugin
 */
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
