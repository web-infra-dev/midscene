const fs = require('node:fs');
const path = require('node:path');

const coverageRoot = path.join(process.cwd(), 'coverage');
const metricNames = ['statements', 'branches', 'functions', 'lines'];

function formatArtifactLink() {
  const artifactUrl = process.env.COVERAGE_ARTIFACT_URL;
  if (!artifactUrl) {
    return 'Full HTML and JSON reports are available in the `coverage` artifact.\n';
  }

  return `Full HTML and JSON reports are available in the [coverage artifact](${artifactUrl}).\n`;
}

function formatMetric(metric) {
  if (!metric.total) {
    return '100% (0/0)';
  }

  const pct = ((metric.covered / metric.total) * 100).toFixed(2);
  return `${pct}% (${metric.covered}/${metric.total})`;
}

function createCoverageSummary() {
  if (!fs.existsSync(coverageRoot)) {
    return '## Unit Test Coverage\n\nNo coverage directory was generated.\n';
  }

  const totals = Object.fromEntries(
    metricNames.map((name) => [name, { covered: 0, total: 0 }]),
  );

  const rows = fs
    .readdirSync(coverageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const summaryFile = path.join(
        coverageRoot,
        entry.name,
        'coverage-summary.json',
      );
      if (!fs.existsSync(summaryFile)) {
        return null;
      }

      const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')).total;
      for (const metricName of metricNames) {
        totals[metricName].covered += summary[metricName].covered;
        totals[metricName].total += summary[metricName].total;
      }

      return {
        project: entry.name.replaceAll('__', '/'),
        summary,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.project.localeCompare(b.project));

  let markdown = '## Unit Test Coverage\n\n';
  if (!rows.length) {
    return `${markdown}No coverage summary files were generated.\n`;
  }

  markdown += '| Project | Statements | Branches | Functions | Lines |\n';
  markdown += '| --- | ---: | ---: | ---: | ---: |\n';
  markdown += `| **Total** | **${formatMetric(totals.statements)}** | **${formatMetric(totals.branches)}** | **${formatMetric(totals.functions)}** | **${formatMetric(totals.lines)}** |\n`;

  for (const row of rows) {
    markdown += `| ${row.project} | ${formatMetric(row.summary.statements)} | ${formatMetric(row.summary.branches)} | ${formatMetric(row.summary.functions)} | ${formatMetric(row.summary.lines)} |\n`;
  }

  markdown += `\n${formatArtifactLink()}`;

  return markdown;
}

const markdown = createCoverageSummary();
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (summaryPath) {
  fs.appendFileSync(summaryPath, markdown);
} else {
  process.stdout.write(markdown);
}
