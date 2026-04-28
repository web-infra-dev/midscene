import fs from 'node:fs';
import path from 'node:path';

const MAGIC_STRING = 'REPLACE_ME_WITH_REPORT_HTML';
const REPLACED_MARK = '/*REPORT_HTML_REPLACED*/';
const REG_EXP_FOR_REPLACE = /\/\*REPORT_HTML_REPLACED\*\/.*/;

interface RslibPluginApi {
  onAfterBuild: (callback: () => void) => void;
}

/**
 * Rslib plugin to inject report HTML from @midscene/core dist into MCP bundle.
 * This runs after build and reads the already-injected HTML from core.
 *
 * Prerequisites:
 * - @midscene/report must be in devDependencies to ensure correct build order
 * - @midscene/core dist must exist with injected HTML
 *
 * @param packageDir - The directory of the MCP package (use __dirname)
 */
export function injectReportHtmlFromCore(packageDir: string) {
  return {
    name: 'inject-report-html-from-core',
    setup(api: RslibPluginApi) {
      api.onAfterBuild(() => {
        const coreUtilsPath = path.resolve(
          packageDir,
          '..',
          'core',
          'dist',
          'lib',
          'utils.js',
        );

        if (!fs.existsSync(coreUtilsPath)) {
          console.warn(
            '[inject-report-html] @midscene/core dist not found, skipping',
          );
          return;
        }

        const coreContent = fs.readFileSync(coreUtilsPath, 'utf-8');
        if (!coreContent.includes(REPLACED_MARK)) {
          console.warn(
            '[inject-report-html] HTML not found in core dist. Ensure report builds first.',
          );
          return;
        }

        // Extract the JSON string after the marker
        // JSON strings can contain escaped quotes, so we need to properly parse it
        const markerIndex = coreContent.indexOf(REPLACED_MARK);
        const jsonStart = markerIndex + REPLACED_MARK.length;

        // Find the end of the JSON string by tracking quote escaping
        let jsonEnd = jsonStart;
        if (coreContent[jsonStart] === '"') {
          jsonEnd = jsonStart + 1;
          while (jsonEnd < coreContent.length) {
            if (coreContent[jsonEnd] === '\\') {
              jsonEnd += 2; // Skip escaped character
            } else if (coreContent[jsonEnd] === '"') {
              jsonEnd += 1; // Include closing quote
              break;
            } else {
              jsonEnd += 1;
            }
          }
        }

        const jsonString = coreContent.slice(jsonStart, jsonEnd);
        if (!jsonString || jsonString.length < 10) {
          console.warn('[inject-report-html] Failed to extract HTML from core');
          return;
        }

        const finalContent = `${REPLACED_MARK}${jsonString}`;
        const distDir = path.join(packageDir, 'dist');

        if (!fs.existsSync(distDir)) return;

        const jsFiles = fs
          .readdirSync(distDir)
          .filter((f) => f.endsWith('.js'));
        let injectedCount = 0;

        for (const file of jsFiles) {
          const filePath = path.join(distDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          if (content.includes(REPLACED_MARK)) {
            if (REG_EXP_FOR_REPLACE.test(content)) {
              fs.writeFileSync(
                filePath,
                content.replace(REG_EXP_FOR_REPLACE, () => finalContent),
              );
              console.log(`[inject-report-html] Updated: ${file}`);
              injectedCount++;
            }
          } else if (content.includes(`'${MAGIC_STRING}'`)) {
            fs.writeFileSync(
              filePath,
              content.replace(`'${MAGIC_STRING}'`, () => finalContent),
            );
            console.log(`[inject-report-html] Injected: ${file}`);
            injectedCount++;
          }
        }

        if (injectedCount > 0) {
          console.log(
            `[inject-report-html] Completed: ${injectedCount} file(s)`,
          );
        }
      });
    },
  };
}
