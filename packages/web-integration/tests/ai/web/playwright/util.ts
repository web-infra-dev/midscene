import fs from 'node:fs';
import path from 'node:path';

export function getLastModifiedReportHTMLFile(dirPath: string) {
  let latestFile = null;
  let latestMtime = 0;

  function traverse(currentPath: string) {
    const files = fs.readdirSync(currentPath);

    files.forEach((file) => {
      const filePath = path.join(currentPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        traverse(filePath);
      } else if (
        stats.isFile() &&
        path.extname(file).toLowerCase() === '.html' &&
        !file.toLowerCase().startsWith('latest')
      ) {
        // Read the file content
        const content = fs.readFileSync(filePath, 'utf8');
        // Check if the content includes 'todo report'
        if (
          content.includes(
            '"groupDescription":"tests/ai/e2e/ai-auto-todo.spec.ts"',
          )
        ) {
          if (stats.mtimeMs > latestMtime) {
            latestMtime = stats.mtimeMs;
            latestFile = filePath;
            // console.log('filePath', filePath);
          }
        }
      }
    });
  }

  traverse(dirPath);
  return latestFile;
}
