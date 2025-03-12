import fs from 'node:fs';
import path from 'node:path';

export function getLastModifiedReportHTMLFile(dirPath: string) {
  let latestFile = null;
  let latestMtime = 0;

  function traverse(currentPath: string) {
    const files = fs.readdirSync(currentPath);

    files
      .filter((file) => /merged/.test(file))
      .forEach((file) => {
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
          if (
            stats.mtimeMs > latestMtime &&
            /groupDescription":".*\/playwright\/ai-auto-todo/i.test(content)
          ) {
            // Check if the content includes 'todo report'
            latestMtime = stats.mtimeMs;
            latestFile = filePath;
            // console.log('filePath', filePath);
          } else {
            console.log('file not matching', filePath);
          }
        }
      });
  }

  traverse(dirPath);
  return latestFile;
}
