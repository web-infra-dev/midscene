import path from 'node:path';
import os from 'os';
import fsExtra from 'fs-extra';

const projectDir = process.cwd();
const reportHtmlDir = path.join(projectDir, `node_modules/@midscene/visualizer-report/dist`);
const distPath = path.join(projectDir, `dist/visualizer-report`);

const tempDir = path.join(os.tmpdir(), 'temp-folder');
try {
  // First copy to the temporary directory
  fsExtra.copySync(reportHtmlDir, tempDir);
  // Then move the contents of the temporary directory to the destination directory
  fsExtra.moveSync(tempDir, distPath, { overwrite: true });
} catch (err) {
  console.error('An error occurred while copying the folder.', err);
}
