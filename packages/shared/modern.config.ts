import { defineConfig, moduleTools } from '@modern-js/module-tools';
import fs from "fs"
import path from "path"

const marcoReplace = () => ({
  name: 'marco-replace-plugin',
  setup() {
    // We need to build script before building pkg for reading the output in script dir.
    // And we must read file and cache it before any hook calling since modernjs will clear dist dir before compiling.
    const scriptPath = path.resolve(__dirname, './dist/script/htmlElement.js');
    if (!fs.existsSync(scriptPath)) {
      console.log('htmlElement.js not found, skipping replacement.');
      process.exit();
    }
    const htmlRaw = fs.readFileSync(scriptPath, 'utf-8')
    return {
      afterBuild: async () => {

        const scriptContent = JSON.stringify(htmlRaw);
        const filesToPatch = [
          path.resolve(__dirname, './dist/lib/fs.js'),
          path.resolve(__dirname, './dist/es/fs.js'),
        ];


        filesToPatch.forEach(filePath => {
          if (fs.existsSync(filePath)) {
            try {
              const fileContent = fs.readFileSync(filePath, 'utf-8');
              const newContent = fileContent.replaceAll(
                /\{\s*ELEMENT_INFO_SCRIPT_CONTENT\s*\}/g,
                scriptContent
              );
              fs.writeFileSync(filePath, newContent);
              console.log(`[post-build] Patched ${path.relative(path.resolve(__dirname, '..'), filePath)}`);
            } catch (e) {
              console.error(`[post-build] Error patching ${filePath}`, e);
              process.exit(1);
            }
          } else {
            console.log(`[post-build] ${path.basename(filePath)} not found, skipping patch.`);
          }
        });
        console.log('[post-build] Script finished successfully.');
      }
    }
  },
})


export default defineConfig({
  plugins: [moduleTools(), marcoReplace()],
  buildPreset: 'npm-library',
  buildConfig: {
    input: {
      index: './src/index.ts',
      img: './src/img/index.ts',
      constants: './src/constants/index.ts',
      extractor: './src/extractor/index.ts',
      'extractor-debug': './src/extractor/debug.ts',
      fs: './src/node/fs.ts',
      utils: './src/utils.ts',
      logger: './src/logger.ts',
      common: './src/common.ts',
      'us-keyboard-layout': './src/us-keyboard-layout.ts',
      env: './src/env.ts',
      types: './src/types/index.ts',
    },
    target: 'es2020',
    dts: {
      respectExternal: true,
    },
  },
});
