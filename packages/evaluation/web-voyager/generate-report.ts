/**
 * Generate a visual HTML report from optimization run data.
 *
 * Usage:
 *   npx tsx web-voyager/generate-report.ts [run-dir]
 *
 * If no run-dir specified, uses the latest run.
 * Opens the generated HTML in the default browser.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WV = __dirname;
const RUNS_DIR = path.join(WV, 'optimization-runs');

function findLatestRun(): string {
  const runs = readdirSync(RUNS_DIR)
    .filter((d) => d.startsWith('run-'))
    .sort()
    .reverse();
  if (!runs[0]) throw new Error('No runs found');
  return path.join(RUNS_DIR, runs[0]);
}

function loadJson(filePath: string): any {
  return existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, 'utf-8'))
    : null;
}

function loadText(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Diff two rule texts (simple line-by-line)
function diffRules(before: string, after: string): string {
  const beforeLines = before.split('\n').filter((l) => l.trim());
  const afterLines = after.split('\n').filter((l) => l.trim());
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const lines: string[] = [];
  for (const l of afterLines) {
    if (!beforeSet.has(l)) {
      lines.push(`<div class="diff-add">+ ${escapeHtml(l)}</div>`);
    } else {
      lines.push(`<div class="diff-same">&nbsp; ${escapeHtml(l)}</div>`);
    }
  }
  for (const l of beforeLines) {
    if (!afterSet.has(l)) {
      lines.push(`<div class="diff-remove">- ${escapeHtml(l)}</div>`);
    }
  }
  return lines.join('\n');
}

function main() {
  const runDir = process.argv[2] || findLatestRun();
  console.log(`Generating report for: ${runDir}`);

  const summary = loadJson(path.join(runDir, 'summary.json'));
  const iters = readdirSync(runDir)
    .filter((d) => d.startsWith('iter-'))
    .sort();

  // Collect iteration data
  const iterData: any[] = [];
  for (const iterName of iters) {
    const iterDir = path.join(runDir, iterName);
    const judgeResults =
      loadJson(path.join(iterDir, 'judge-results.json')) || [];
    const analysis = loadJson(path.join(iterDir, 'analysis.json'));
    const promptBefore = loadText(path.join(iterDir, 'prompt-before.txt'));
    const promptAfter = loadText(path.join(iterDir, 'prompt-after.txt'));
    const promptProposed = loadText(path.join(iterDir, 'prompt-proposed.txt'));

    const succeeded = judgeResults.filter(
      (r: any) => r.judgeVerdict === 'SUCCESS',
    );
    const total = judgeResults.length;
    const avgTokens =
      total > 0
        ? Math.round(
            judgeResults.reduce(
              (s: number, r: any) => s + (r.tokenUsage?.totalTokens || 0),
              0,
            ) / total,
          )
        : 0;

    iterData.push({
      name: iterName,
      judgeResults,
      analysis,
      promptBefore,
      promptAfter,
      promptProposed,
      successCount: succeeded.length,
      totalCount: total,
      avgTokens,
    });
  }

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Midscene Prompt Optimization Report</title>
<style>
  :root {
    --bg: #f8f9fa;
    --surface: #ffffff;
    --border: #e1e4e8;
    --text: #24292f;
    --text-dim: #656d76;
    --accent: #0969da;
    --success: #1a7f37;
    --fail: #cf222e;
    --warn: #9a6700;
    --add-bg: #dafbe1;
    --add-text: #116329;
    --remove-bg: #ffebe9;
    --remove-text: #82071e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2rem; }
  h1 { color: var(--text); font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { color: var(--accent); font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { color: var(--text); font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  .meta { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 2rem; }
  .meta span { margin-right: 1.5rem; }

  /* Overview cards */
  .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .card-label { font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 2rem; font-weight: 700; margin-top: 0.3rem; }
  .card-value.success { color: var(--success); }
  .card-value.accent { color: var(--accent); }
  .card-value.warn { color: var(--warn); }

  /* Chart */
  .chart-container { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
  .chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; }
  .bar-group { display: flex; flex-direction: column; align-items: center; flex: 1; }
  .bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.3s; }
  .bar.success-bar { background: var(--success); }
  .bar.token-bar { background: var(--accent); }
  .bar-label { font-size: 0.7rem; color: var(--text-dim); margin-top: 4px; }

  /* Iteration section */
  .iteration { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .iter-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .iter-badge { padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
  .iter-badge.pass { background: #dafbe1; color: var(--success); }
  .iter-badge.partial { background: #fff8c5; color: var(--warn); }
  .iter-badge.fail { background: #ffebe9; color: var(--fail); }

  /* Task table */
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin: 0.5rem 0; }
  th { text-align: left; color: var(--text-dim); font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  tr:hover td { background: #f0f6ff; }
  .verdict-success { color: var(--success); font-weight: 600; }
  .verdict-fail { color: var(--fail); font-weight: 600; }
  .verdict-error { color: var(--text-dim); }
  .token-cell { font-variant-numeric: tabular-nums; }

  /* Diff view */
  .diff { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; line-height: 1.8; overflow-x: auto; margin: 0.5rem 0; }
  .diff-add { color: var(--add-text); background: var(--add-bg); padding: 0 4px; border-radius: 2px; }
  .diff-remove { color: var(--remove-text); background: var(--remove-bg); padding: 0 4px; border-radius: 2px; text-decoration: line-through; }
  .diff-same { color: var(--text-dim); }

  /* Analysis */
  .analysis { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-size: 0.85rem; line-height: 1.7; margin: 0.5rem 0; white-space: pre-wrap; }
  .changes-list { list-style: none; margin: 0.5rem 0; }
  .changes-list li { padding: 4px 0; padding-left: 1rem; position: relative; }
  .changes-list li::before { content: '→'; position: absolute; left: 0; color: var(--accent); }

  /* Collapsible */
  details { margin: 0.5rem 0; }
  summary { cursor: pointer; color: var(--accent); font-size: 0.85rem; padding: 4px 0; }
  summary:hover { text-decoration: underline; }

  /* Prompt view */
  .prompt-view { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.78rem; line-height: 1.7; overflow-x: auto; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
</style>
</head>
<body>

<h1>Midscene Prompt Optimization Report</h1>
<div class="meta">
  <span>Run: ${path.basename(runDir)}</span>
  <span>Tasks: ${summary?.tasks?.join(', ') || 'N/A'}</span>
  <span>Generated: ${new Date().toISOString().slice(0, 19)}</span>
</div>

<!-- Overview -->
<div class="overview">
  <div class="card">
    <div class="card-label">Iterations</div>
    <div class="card-value accent">${iterData.length}</div>
  </div>
  <div class="card">
    <div class="card-label">Best Success Rate</div>
    <div class="card-value success">${iterData.length > 0 ? Math.max(...iterData.map((d) => (d.totalCount > 0 ? Math.round((d.successCount / d.totalCount) * 100) : 0))) : 0}%</div>
  </div>
  <div class="card">
    <div class="card-label">Best Avg Tokens</div>
    <div class="card-value warn">${iterData.length > 0 ? Math.min(...iterData.filter((d) => d.avgTokens > 0).map((d) => d.avgTokens)).toLocaleString() : 'N/A'}</div>
  </div>
  <div class="card">
    <div class="card-label">Final Rules Count</div>
    <div class="card-value accent">${iterData.length > 0 ? (iterData[iterData.length - 1].promptAfter || iterData[iterData.length - 1].promptBefore).split('\n').filter((l: string) => l.startsWith('- **')).length : 'N/A'}</div>
  </div>
</div>

<!-- Trend chart -->
${
  iterData.length > 1
    ? `
<h2>Trend</h2>
<div class="chart-container">
  <h3 style="margin-bottom: 0.8rem;">Success Rate per Iteration</h3>
  <div class="chart">
    ${iterData
      .map((d, i) => {
        const pct =
          d.totalCount > 0 ? (d.successCount / d.totalCount) * 100 : 0;
        return `<div class="bar-group"><div class="bar success-bar" style="height:${Math.max(pct, 2)}%"></div><div class="bar-label">#${i + 1}<br>${Math.round(pct)}%</div></div>`;
      })
      .join('')}
  </div>
</div>
<div class="chart-container">
  <h3 style="margin-bottom: 0.8rem;">Avg Tokens per Iteration</h3>
  <div class="chart">
    ${(() => {
      const maxTok = Math.max(...iterData.map((d) => d.avgTokens), 1);
      return iterData
        .map((d, i) => {
          const pct = (d.avgTokens / maxTok) * 100;
          return `<div class="bar-group"><div class="bar token-bar" style="height:${Math.max(pct, 2)}%"></div><div class="bar-label">#${i + 1}<br>${(d.avgTokens / 1000).toFixed(0)}K</div></div>`;
        })
        .join('');
    })()}
  </div>
</div>
`
    : ''
}

<!-- Per-iteration details -->
${iterData
  .map((d, i) => {
    const badgeClass =
      d.totalCount === 0
        ? 'fail'
        : d.successCount === d.totalCount
          ? 'pass'
          : d.successCount > 0
            ? 'partial'
            : 'fail';
    const badgeText =
      d.totalCount === 0
        ? 'No data'
        : `${d.successCount}/${d.totalCount} passed`;

    return `
<h2>Iteration ${i + 1}</h2>
<div class="iteration">
  <div class="iter-header">
    <div>
      <span class="iter-badge ${badgeClass}">${badgeText}</span>
      <span style="margin-left: 1rem; color: var(--text-dim); font-size: 0.85rem;">Avg tokens: ${d.avgTokens.toLocaleString()}</span>
    </div>
  </div>

  <!-- Task results -->
  ${
    d.judgeResults.length > 0
      ? `
  <h3>Task Results</h3>
  <table>
    <tr>
      <th>Task</th>
      <th>Verdict</th>
      <th>Tokens</th>
      <th>Reason</th>
    </tr>
    ${d.judgeResults
      .map((r: any) => {
        const cls =
          r.judgeVerdict === 'SUCCESS'
            ? 'verdict-success'
            : r.judgeVerdict === 'ERROR'
              ? 'verdict-error'
              : 'verdict-fail';
        const icon = r.judgeVerdict === 'SUCCESS' ? '✅' : '❌';
        return `<tr>
        <td>${escapeHtml(r.taskId)}</td>
        <td class="${cls}">${icon} ${r.judgeVerdict}</td>
        <td class="token-cell">${(r.tokenUsage?.totalTokens || 0).toLocaleString()}</td>
        <td style="color: var(--text-dim); font-size: 0.8rem;">${escapeHtml((r.judgeReason || '').slice(0, 120))}</td>
      </tr>`;
      })
      .join('')}
  </table>
  `
      : '<p style="color: var(--text-dim);">No benchmark data for this iteration.</p>'
  }

  <!-- Analysis -->
  ${
    d.analysis
      ? `
  <h3>GPT-5.4 Analysis</h3>
  <div class="analysis">${escapeHtml(d.analysis.analysis || '')}</div>

  <h3>Proposed Changes</h3>
  <ul class="changes-list">
    ${(d.analysis.changesExplained || '')
      .split('\n')
      .filter((l: string) => l.trim())
      .map((l: string) => `<li>${escapeHtml(l.replace(/^- /, ''))}</li>`)
      .join('')}
  </ul>
  `
      : ''
  }

  <!-- Prompt diff -->
  ${
    d.promptBefore && d.promptAfter && d.promptBefore !== d.promptAfter
      ? `
  <h3>Prompt Diff</h3>
  <div class="diff">${diffRules(d.promptBefore, d.promptAfter)}</div>
  `
      : ''
  }

  <!-- Collapsible: full prompts -->
  <details>
    <summary>View full prompt (before)</summary>
    <div class="prompt-view">${escapeHtml(d.promptBefore || '(empty)')}</div>
  </details>
  ${
    d.promptAfter
      ? `
  <details>
    <summary>View full prompt (after)</summary>
    <div class="prompt-view">${escapeHtml(d.promptAfter)}</div>
  </details>
  `
      : ''
  }
</div>`;
  })
  .join('')}

<div style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.8rem;">
  Generated by Midscene Prompt Optimization Loop · ${new Date().toISOString()}
</div>

</body>
</html>`;

  const outPath = path.join(runDir, 'report.html');
  writeFileSync(outPath, html);
  console.log(`Report saved to: ${outPath}`);

  // Try to open in browser
  try {
    const { execSync: exec } = require('node:child_process');
    exec(`open "${outPath}"`, { stdio: 'ignore' });
    console.log('Opened in browser');
  } catch {
    console.log('Open manually:', outPath);
  }
}

main();
