/**
 * Unified comparison report generator.
 *
 * Reads result JSON files from all three frameworks and generates a comparison table.
 *
 * Usage:
 *   npx tsx compare.ts <midscene-result.json> <browser-use-result.json> <stagehand-result.json>
 *
 * Or auto-discover latest results:
 *   npx tsx compare.ts --auto
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface ResultFile {
  framework: string;
  modelName: string;
  timestamp: string;
  totalTasks: number;
  successCount: number;
  successRate: number;
  avgSteps: number;
  avgTimeMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  results: Array<{
    taskId: string;
    webName: string;
    question: string;
    agentAnswer: string | null;
    success: boolean | null;
    judgeVerdict: string | null;
    judgeReason: string | null;
    error: string | null;
    totalSteps: number;
    totalTimeMs: number;
    tokenUsage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    estimatedCostUsd: number;
  }>;
}

function loadResult(filePath: string): ResultFile {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

  // Normalize: Midscene runner uses a slightly different top-level shape
  if (!raw.framework && raw.modelName) {
    raw.framework = 'midscene';
  }

  return raw as ResultFile;
}

function findLatestResult(dir: string, prefix: string): string | null {
  if (!readdirSync(dir).length) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  return files[0] ? path.join(dir, files[0]) : null;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
function generateComparison(frameworks: ResultFile[]): string {
  const lines: string[] = [];
  const sep = '═'.repeat(90);

  lines.push(sep);
  lines.push('WEBVOYAGER BENCHMARK COMPARISON');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(sep);
  lines.push('');

  // --- Overview table ---
  lines.push('## Overall Results');
  lines.push('');

  const header = `${pad('Metric', 25)} ${frameworks.map((f) => rpad(f.framework, 18)).join(' ')}`;
  lines.push(header);
  lines.push('─'.repeat(header.length));

  const rows = [
    ['Model', ...frameworks.map((f) => f.modelName)],
    ['Tasks', ...frameworks.map((f) => String(f.totalTasks))],
    ['Success Count', ...frameworks.map((f) => String(f.successCount))],
    [
      'Success Rate',
      ...frameworks.map((f) => `${(f.successRate * 100).toFixed(1)}%`),
    ],
    ['Avg Steps', ...frameworks.map((f) => f.avgSteps.toFixed(1))],
    [
      'Avg Time',
      ...frameworks.map((f) => `${(f.avgTimeMs / 1000).toFixed(1)}s`),
    ],
    [
      'Avg Input Tokens',
      ...frameworks.map((f) =>
        Math.round(f.totalInputTokens / (f.totalTasks || 1)).toLocaleString(),
      ),
    ],
    [
      'Avg Output Tokens',
      ...frameworks.map((f) =>
        Math.round(f.totalOutputTokens / (f.totalTasks || 1)).toLocaleString(),
      ),
    ],
    [
      'Total Input Tokens',
      ...frameworks.map((f) => f.totalInputTokens.toLocaleString()),
    ],
    [
      'Total Output Tokens',
      ...frameworks.map((f) => f.totalOutputTokens.toLocaleString()),
    ],
    ['Total Cost', ...frameworks.map((f) => `$${f.totalCostUsd.toFixed(2)}`)],
    [
      'Avg Cost/Task',
      ...frameworks.map(
        (f) => `$${(f.totalCostUsd / (f.totalTasks || 1)).toFixed(3)}`,
      ),
    ],
  ];

  for (const row of rows) {
    lines.push(
      `${pad(row[0], 25)} ${row
        .slice(1)
        .map((v) => rpad(v, 18))
        .join(' ')}`,
    );
  }

  lines.push('');

  // --- Per-website comparison ---
  lines.push('## Per-Website Success Rate');
  lines.push('');

  // Collect all websites
  const allWebsites = new Set<string>();
  for (const fw of frameworks) {
    for (const r of fw.results) allWebsites.add(r.webName);
  }

  const wsHeader = `${pad('Website', 25)} ${frameworks.map((f) => rpad(f.framework, 18)).join(' ')}`;
  lines.push(wsHeader);
  lines.push('─'.repeat(wsHeader.length));

  for (const ws of [...allWebsites].sort()) {
    const cells = frameworks.map((fw) => {
      const tasks = fw.results.filter((r) => r.webName === ws);
      const success = tasks.filter((r) => r.success).length;
      return `${success}/${tasks.length}`;
    });
    lines.push(`${pad(ws, 25)} ${cells.map((c) => rpad(c, 18)).join(' ')}`);
  }

  lines.push('');

  // --- Per-task detail ---
  lines.push('## Per-Task Results');
  lines.push('');

  // Build task map
  const allTaskIds = new Set<string>();
  for (const fw of frameworks) {
    for (const r of fw.results) allTaskIds.add(r.taskId);
  }

  const taskHeader = `${pad('Task ID', 30)} ${frameworks.map((f) => rpad(f.framework, 22)).join(' ')}`;
  lines.push(taskHeader);
  lines.push('─'.repeat(taskHeader.length));

  for (const taskId of [...allTaskIds].sort()) {
    const cells = frameworks.map((fw) => {
      const r = fw.results.find((r) => r.taskId === taskId);
      if (!r) return 'N/A';
      const status = r.error
        ? 'ERR'
        : r.success
          ? 'OK'
          : r.success === false
            ? 'FAIL'
            : '?';
      const tokens = r.tokenUsage.totalTokens;
      const time = (r.totalTimeMs / 1000).toFixed(0);
      return `${status} ${time}s ${tokens}tk`;
    });
    lines.push(`${pad(taskId, 30)} ${cells.map((c) => rpad(c, 22)).join(' ')}`);
  }

  lines.push('');
  lines.push(sep);

  return lines.join('\n');
}

function generateMarkdown(frameworks: ResultFile[]): string {
  const lines: string[] = [];

  lines.push('# WebVoyager Benchmark Comparison');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(
    `> Model: ${frameworks[0]?.modelName || 'unknown'} (same across all frameworks)`,
  );
  lines.push('');

  // Overview table
  lines.push('## Overall Results');
  lines.push('');
  lines.push(`| Metric | ${frameworks.map((f) => f.framework).join(' | ')} |`);
  lines.push(`| --- | ${frameworks.map(() => '---').join(' | ')} |`);

  const mdRows = [
    ['Tasks', ...frameworks.map((f) => String(f.totalTasks))],
    [
      'Success Rate',
      ...frameworks.map(
        (f) =>
          `**${(f.successRate * 100).toFixed(1)}%** (${f.successCount}/${f.totalTasks})`,
      ),
    ],
    ['Avg Steps', ...frameworks.map((f) => f.avgSteps.toFixed(1))],
    [
      'Avg Time',
      ...frameworks.map((f) => `${(f.avgTimeMs / 1000).toFixed(1)}s`),
    ],
    [
      'Avg Input Tokens',
      ...frameworks.map((f) =>
        Math.round(f.totalInputTokens / (f.totalTasks || 1)).toLocaleString(),
      ),
    ],
    [
      'Avg Output Tokens',
      ...frameworks.map((f) =>
        Math.round(f.totalOutputTokens / (f.totalTasks || 1)).toLocaleString(),
      ),
    ],
    ['Total Cost', ...frameworks.map((f) => `$${f.totalCostUsd.toFixed(2)}`)],
    [
      'Cost per Task',
      ...frameworks.map(
        (f) => `$${(f.totalCostUsd / (f.totalTasks || 1)).toFixed(3)}`,
      ),
    ],
  ];

  for (const row of mdRows) {
    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');

  // Per-website
  lines.push('## Per-Website Success Rate');
  lines.push('');
  lines.push(`| Website | ${frameworks.map((f) => f.framework).join(' | ')} |`);
  lines.push(`| --- | ${frameworks.map(() => '---').join(' | ')} |`);

  const allWebsites = new Set<string>();
  for (const fw of frameworks)
    for (const r of fw.results) allWebsites.add(r.webName);

  for (const ws of [...allWebsites].sort()) {
    const cells = frameworks.map((fw) => {
      const tasks = fw.results.filter((r) => r.webName === ws);
      const success = tasks.filter((r) => r.success).length;
      return `${success}/${tasks.length}`;
    });
    lines.push(`| ${ws} | ${cells.join(' | ')} |`);
  }

  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

let files: string[];

if (args.includes('--auto')) {
  // Auto-discover latest results from all known locations
  const baseDir = __dirname;
  const midsceneResult = findLatestResult(
    path.join(baseDir, 'results'),
    'eval-',
  );
  const browserUseResult =
    findLatestResult(
      path.join(baseDir, '_workspace', 'eval', 'results'),
      'eval-browser-use',
    ) || findLatestResult(path.join(baseDir, 'results'), 'eval-browser-use');
  const stagehandResult =
    findLatestResult(
      path.join(baseDir, '_workspace', 'stagehand', 'results'),
      'eval-stagehand',
    ) || findLatestResult(path.join(baseDir, 'results'), 'eval-stagehand');

  files = [midsceneResult, browserUseResult, stagehandResult].filter(
    Boolean,
  ) as string[];

  if (files.length === 0) {
    console.error('No result files found. Run the evaluations first.');
    process.exit(1);
  }

  console.log('Auto-discovered result files:');
  for (const f of files) console.log(`  ${f}`);
} else {
  files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error(
      'Usage: npx tsx compare.ts <result1.json> <result2.json> [result3.json]',
    );
    console.error('   or: npx tsx compare.ts --auto');
    process.exit(1);
  }
}

const frameworks = files.map(loadResult);

// Print text comparison
const textReport = generateComparison(frameworks);
console.log(textReport);

// Save markdown
const mdReport = generateMarkdown(frameworks);
const outputDir = path.join(__dirname, 'results');
const mdPath = path.join(outputDir, `comparison-${Date.now()}.md`);
writeFileSync(mdPath, mdReport);
console.log(`\nMarkdown report saved to: ${mdPath}`);

// Save JSON comparison
const jsonPath = path.join(outputDir, `comparison-${Date.now()}.json`);
writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      frameworks: frameworks.map((f) => ({
        framework: f.framework,
        modelName: f.modelName,
        totalTasks: f.totalTasks,
        successCount: f.successCount,
        successRate: f.successRate,
        avgSteps: f.avgSteps,
        avgTimeMs: f.avgTimeMs,
        totalInputTokens: f.totalInputTokens,
        totalOutputTokens: f.totalOutputTokens,
        totalCostUsd: f.totalCostUsd,
      })),
    },
    null,
    2,
  ),
);
console.log(`JSON report saved to: ${jsonPath}`);
