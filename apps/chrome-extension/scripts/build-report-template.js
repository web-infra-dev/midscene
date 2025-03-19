#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory path of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root directory
const projectRoot = path.resolve(__dirname, '../../..');

// Path configuration
const visualizerReportPath = path.join(
  projectRoot,
  'packages/visualizer/dist/report/index.html',
);
const outputDir = path.join(__dirname, '../dist/scripts');
const outputFile = path.join(outputDir, 'report-template.js');

// Ensure the output directory exists
console.log(`Creating output directory: ${outputDir}`);
fs.mkdirSync(outputDir, {
  recursive: true,
});

// Check if the visualizer has been built
if (!fs.existsSync(visualizerReportPath)) {
  console.error(
    `ERROR: Report template file not found at ${visualizerReportPath}`,
  );
  console.error(
    'Make sure to build the visualizer package first with: npm run build -w @midscene/visualizer',
  );
  process.exit(1);
}

// Read the report template HTML
console.log(`Reading report template from: ${visualizerReportPath}`);
const reportHtml = fs.readFileSync(visualizerReportPath, 'utf8');

// Create JavaScript function
const jsContent = `
// Generated report template from visualizer
window.get_midscene_report_tpl = function() {
  return ${JSON.stringify(reportHtml)};
};
`;

// Write to file
fs.writeFileSync(outputFile, jsContent);
console.log(`Report template successfully written to: ${outputFile}`);
