/**
 * Run real Midscene YAML tests to generate reports, then create demo files:
 * - demo.html: single report (passed case)
 * - demo-merged.html: merged report with both passed and failed cases
 *
 * Usage: node scripts/generate-demo-report.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const repoRoot = path.join(rootDir, '..', '..');
const distDir = path.join(rootDir, 'dist');

// Resolve report directory the same way the runtime does (respects MIDSCENE_RUN_DIR)
const runDir = process.env.MIDSCENE_RUN_DIR || 'midscene_run';
const reportDir = path.resolve(repoRoot, runDir, 'report');

const cliPath = path.join(repoRoot, 'packages', 'cli', 'bin', 'midscene');

/**
 * Run a YAML file and return the path to the newly generated report.
 * The CLI exits non-zero on any assertion failure or AI timeout, but
 * the report is still generated. We catch and check for the report file.
 */
function runYamlAndFindReport(yamlPath) {
  const before = new Set(listGeneratedReportFiles());

  try {
    execFileSync('node', [cliPath, yamlPath], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch {
    console.log(
      'Test exited with errors, but report may still have been generated.',
    );
  }

  const after = listGeneratedReportFiles();
  const newReports = after.filter((filePath) => !before.has(filePath));

  if (newReports.length === 0) {
    console.error(`No new report generated for ${path.basename(yamlPath)}.`);
    return null;
  }

  const latest = newReports
    .map((filePath) => ({
      filePath,
      mtime: fs.statSync(filePath).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0].filePath;

  return latest;
}

function listGeneratedReportFiles() {
  if (!fs.existsSync(reportDir)) {
    return [];
  }

  const entries = fs.readdirSync(reportDir, { withFileTypes: true });
  const reportFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(reportDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.html')) {
      reportFiles.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      const nestedIndexPath = path.join(entryPath, 'index.html');
      if (fs.existsSync(nestedIndexPath)) {
        reportFiles.push(nestedIndexPath);
      }
    }
  }

  return reportFiles;
}

// --- Generate reports ---

console.log('=== Generating passed report ===');
const passedYaml = path.join(rootDir, 'scripts', 'generate-report.yaml');
const passedReport = runYamlAndFindReport(passedYaml);
if (!passedReport) {
  console.error('Failed to generate passed report.');
  process.exit(1);
}

console.log('=== Generating failed report ===');
const failedYaml = path.join(rootDir, 'scripts', 'generate-report-failed.yaml');
const failedReport = runYamlAndFindReport(failedYaml);
if (!failedReport) {
  console.error('Failed to generate failed report.');
  process.exit(1);
}

// --- Copy single report as demo.html ---
fs.mkdirSync(distDir, { recursive: true });
const demoPath = path.join(distDir, 'demo.html');
fs.copyFileSync(passedReport, demoPath);
console.log(`Copied ${path.basename(passedReport)} -> dist/demo.html`);

// --- Merge reports into demo-merged.html ---
// Import ReportMergingTool dynamically (it's CJS from @midscene/core dist)
const corePath = path.join(
  repoRoot,
  'packages',
  'core',
  'dist',
  'lib',
  'report.js',
);
const { ReportMergingTool } = await import(corePath);

const merger = new ReportMergingTool();
merger.append({
  reportFilePath: passedReport,
  reportAttributes: {
    testDuration: 30000,
    testStatus: 'passed',
    testTitle: 'Login and verify inventory',
    testId: 'test-passed',
    testDescription: 'Login to saucedemo and verify products page',
  },
});
merger.append({
  reportFilePath: failedReport,
  reportAttributes: {
    testDuration: 25000,
    testStatus: 'failed',
    testTitle: 'Login with intentional failure',
    testId: 'test-failed',
    testDescription: 'Login to saucedemo with a failing assertion',
  },
});

const mergedPath = merger.mergeReports('demo-merged', { overwrite: true });
if (!mergedPath) {
  console.error('Failed to merge reports.');
  process.exit(1);
}

// Copy merged report to dist
const demoMergedPath = path.join(distDir, 'demo-merged.html');
fs.copyFileSync(mergedPath, demoMergedPath);
console.log('Copied merged report -> dist/demo-merged.html');
