/**
 * Run a real Midscene YAML test to generate a report, then copy it as demo.html.
 * This ensures the e2e tests validate against a genuinely generated report.
 *
 * Usage: node scripts/generate-demo-report.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const repoRoot = path.join(rootDir, '..', '..');
const reportDir = path.join(repoRoot, 'midscene_run', 'report');
const distDir = path.join(rootDir, 'dist');

// Record the latest report file before running
const reportsBefore = new Set(
  fs.existsSync(reportDir)
    ? fs.readdirSync(reportDir).filter((f) => f.endsWith('.html'))
    : [],
);

// Run the generation YAML which produces a real report
const yamlPath = path.join(rootDir, 'scripts', 'generate-report.yaml');
const cliPath = path.join(repoRoot, 'packages', 'cli', 'bin', 'midscene');

console.log('Running Midscene test to generate report...');
try {
  execSync(`node ${cliPath} ${yamlPath}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch {
  // Report is still generated even if some assertions fail
  console.log(
    'Test exited with errors, but report may still have been generated.',
  );
}

// Find the newly generated report
const reportsAfter = fs
  .readdirSync(reportDir)
  .filter((f) => f.endsWith('.html'));
const newReports = reportsAfter.filter((f) => !reportsBefore.has(f));

if (newReports.length === 0) {
  console.error('No new report generated. Check if the test ran successfully.');
  process.exit(1);
}

// Pick the most recent one
const latestReport = newReports
  .map((f) => ({
    name: f,
    mtime: fs.statSync(path.join(reportDir, f)).mtimeMs,
  }))
  .sort((a, b) => b.mtime - a.mtime)[0].name;

const reportPath = path.join(reportDir, latestReport);
const demoPath = path.join(distDir, 'demo.html');

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(reportPath, demoPath);
console.log(`Copied ${latestReport} -> dist/demo.html`);
