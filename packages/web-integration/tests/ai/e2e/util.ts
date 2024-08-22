import fs from 'node:fs';
import path from 'node:path';

export function getLastModifiedHTMLFile(dirPath: string) {
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
        path.extname(file).toLowerCase() === '.html'
      ) {
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latestFile = filePath;
        }
      }
    });
  }

  traverse(dirPath);
  return latestFile;
}
