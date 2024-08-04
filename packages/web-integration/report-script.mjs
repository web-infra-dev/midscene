import os from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';

const projectDir = process.cwd();
const reportHtmlDir = path.join(
  projectDir,
  'node_modules/@midscene/visualizer-report/dist',
);
const distPath = path.join(projectDir, 'dist/visualizer-report');
const distPublicPath = path.join(projectDir, 'dist/visualizer-report/public');

const tempDir = path.join(os.tmpdir(), 'temp-folder');

// First copy to the temporary directory
fsExtra.copySync(reportHtmlDir, tempDir);
// Then move the contents of the temporary directory to the destination directory
fsExtra.moveSync(tempDir, distPath, { overwrite: true });
fsExtra.emptyDirSync(distPublicPath);
