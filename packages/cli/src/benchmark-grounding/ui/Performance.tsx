import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { type ReportOverview, formatEconomy } from '../core/overview';
import {
  MetricHelp,
  ModelSnapshots,
  performanceHelp,
} from './components/MetricHelp';
import { ModelPerformanceChart } from './components/ModelPerformanceChart';
import {
  type ModelSortKey,
  type ModelSummary,
  resultStatusLabels,
  sortModels,
  testcasePath,
} from './types';

const columns = [
  { key: 'model', label: 'Model' },
  { key: 'accuracy', label: 'Accuracy' },
  {
    key: 'performance',
    label: 'Performance',
    unit: 'seconds',
    help: performanceHelp,
  },
  {
    key: 'economy',
    label: 'Economy',
    help: (
      <>
        <span>
          The estimated number of test cases the model can evaluate for $1.
          Higher is better. Models with no token charges for the eligible cases
          are shown as Free ($0).
        </span>
        <span className="model-metric-help-formula">
          Economy = eligible cases ÷ (total input tokens × input price + total
          output tokens × output price)
        </span>
        <span>
          Input and output prices are reference rates in USD per token. A case
          is eligible when its final attempt returned a prediction or refusal.
          Paid estimates also require complete token usage. Cache discounts and
          long-context surcharges are excluded.
        </span>
      </>
    ),
  },
  {
    key: 'balance',
    label: 'Balance',
    help: (
      <>
        <span>
          Combines accuracy, performance, and economy. It is the percentage of
          the full-scale radar triangle covered by the model's triangle.
        </span>
        <span className="model-metric-help-formula">
          Balance = (x × y + y × z + z × x) ÷ 300
        </span>
        <span>
          x, y, and z are the radar chart's 0–100 values for Accuracy,
          Performance, and Economy. Shorter times and higher Economy place
          points farther from the center.
        </span>
      </>
    ),
  },
  { key: 'totalTokens', label: 'Total Tokens', unit: 'tokens' },
  { key: 'inputTokens', label: 'Input Tokens', unit: 'tokens' },
  { key: 'outputTokens', label: 'Output Tokens', unit: 'tokens' },
  {
    key: 'duration',
    label: 'Measured Duration',
    unit: 'milliseconds',
    help: 'Actual elapsed time of the final attempt for each testcase that returns a prediction or refusal, including incorrect answers. Covers image preparation, model requests, provider and network delays, and local processing within that attempt.',
  },
] as const;

function formatAverage(
  value: number | null,
  unit: 'tokens' | 'seconds' | 'milliseconds',
) {
  if (value === null) return '—';
  if (unit === 'tokens')
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const seconds = unit === 'milliseconds' ? value / 1000 : value;
  return `${seconds.toFixed(2)} s`;
}

function formatLocalTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Invalid Date';
  const year = String(date.getFullYear()).padStart(4, '0');
  const [month, day, hour, minute, second] = [
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map((part) => String(part).padStart(2, '0'));
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function Reference({ model }: { model: ModelSummary }) {
  const ref = model.reference;
  if (!ref) return <span>No reference data</span>;
  const performance = ref.performance;
  const pricing = ref.pricing;
  return (
    <details>
      <summary>{ref.source}</summary>
      <div className="model-breakdown-reference-details">
        <p>
          {performance ? 'Performance reference' : 'Pricing only'} ·{' '}
          {(performance?.observedAt ?? ref.observedAt).slice(0, 10)}
        </p>
        {performance ? (
          <p>
            {'responseLatencyMs' in performance
              ? `${(performance.responseLatencyMs / 1000).toFixed(2)} s per call`
              : `TTFT ${(performance.timeToFirstTokenMs / 1000).toFixed(2)} s · ${performance.outputTokensPerSecond.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens/s`}
          </p>
        ) : (
          <p>No performance reference for this model version.</p>
        )}
        {pricing ? (
          <p>
            $
            {(pricing.inputPerToken * 1_000_000).toLocaleString('en-US', {
              maximumSignificantDigits: 12,
            })}{' '}
            in / $
            {(pricing.outputPerToken * 1_000_000).toLocaleString('en-US', {
              maximumSignificantDigits: 12,
            })}{' '}
            out per 1M tokens
          </p>
        ) : (
          <p>No pricing reference for this model version.</p>
        )}
        {ref.note && <p>{ref.note}</p>}
        <a href={ref.url} target="_blank" rel="noreferrer">
          Source ↗
        </a>
        {performance && 'url' in performance && performance.url && (
          <p>
            <a href={performance.url} target="_blank" rel="noreferrer">
              Performance source ↗
            </a>
          </p>
        )}
        {performance &&
          'timeToFirstTokenUrl' in performance &&
          performance.timeToFirstTokenUrl && (
            <p>
              <a
                href={performance.timeToFirstTokenUrl}
                target="_blank"
                rel="noreferrer"
              >
                TTFT source ↗
              </a>
            </p>
          )}
      </div>
    </details>
  );
}

export function Performance({
  overview,
  firstTestcase,
  onOpenTestcase,
  onShowTestcase,
}: {
  overview: ReportOverview;
  firstTestcase?: string;
  onOpenTestcase: () => void;
  onShowTestcase: (path: string) => void;
}) {
  const { chart, matrix } = overview;
  const { models } = chart.radar;
  const [sort, setSort] = useState<{
    key: ModelSortKey;
    direction: 'ascending' | 'descending';
  }>({ key: 'model', direction: 'descending' });
  const sorted = useMemo(
    () => sortModels(models, sort.key, sort.direction),
    [models, sort],
  );
  return (
    <>
      <ModelPerformanceChart
        chart={chart}
        firstTestcase={firstTestcase}
        onOpenTestcase={onOpenTestcase}
      />
      <TestcaseMatrix matrix={matrix} onShowTestcase={onShowTestcase} />
      <section
        className="model-breakdown"
        aria-labelledby="model-breakdown-title"
      >
        <header className="model-breakdown-heading">
          <h2 id="model-breakdown-title">Model Performance Breakdown</h2>
        </header>
        <section
          className="model-breakdown-scroll"
          aria-label="Model performance metrics"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The wide table supports keyboard scrolling.
          tabIndex={0}
        >
          <table
            className="model-breakdown-table"
            aria-labelledby="model-breakdown-title"
          >
            <thead>
              <tr>
                {columns.map((column) => {
                  const average = 'unit' in column;
                  const showAverageLabel =
                    average && column.key !== 'performance';
                  const label = showAverageLabel
                    ? `${column.label} Avg.`
                    : column.label;
                  const help = 'help' in column && (
                    <MetricHelp
                      label={label}
                      text={column.help}
                      includeAverageNote={average}
                    />
                  );
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        sort.key === column.key ? sort.direction : 'none'
                      }
                    >
                      <div className="model-breakdown-column-header">
                        <button
                          type="button"
                          className="model-breakdown-sort"
                          aria-label={label}
                          onClick={() =>
                            setSort((current) => ({
                              key: column.key,
                              direction:
                                current.key === column.key
                                  ? current.direction === 'ascending'
                                    ? 'descending'
                                    : 'ascending'
                                  : column.key === 'accuracy' ||
                                      column.key === 'balance' ||
                                      column.key === 'economy'
                                    ? 'descending'
                                    : 'ascending',
                            }))
                          }
                        >
                          <span>{column.label}</span>
                          <span
                            className="model-breakdown-sort-icon"
                            aria-hidden="true"
                          >
                            {sort.key !== column.key
                              ? '↕'
                              : sort.direction === 'ascending'
                                ? '↑'
                                : '↓'}
                          </span>
                        </button>
                        {showAverageLabel ? (
                          <span className="model-breakdown-header-note">
                            Avg.{help}
                          </span>
                        ) : (
                          help
                        )}
                      </div>
                    </th>
                  );
                })}
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((model) => (
                <tr key={model.model}>
                  <th scope="row">
                    <Link
                      className="model-breakdown-name"
                      to={testcasePath(firstTestcase, model.model)}
                      onClick={onOpenTestcase}
                    >
                      {model.model}
                    </Link>
                    <small>
                      <ModelSnapshots ids={model.snapshotIds} />
                    </small>
                    {model.startTimeRange && (
                      <small title="Testcase start times in your local time">
                        {model.startTimeRange
                          .map(formatLocalTimestamp)
                          .join(' ~ ')}
                      </small>
                    )}
                  </th>
                  <td>
                    <strong
                      className="model-breakdown-accuracy"
                      title="Accuracy is the percentage of available final results that are correct. Errors receive zero credit. Missing results are excluded."
                    >
                      {model.accuracy === null
                        ? '—'
                        : `${model.accuracy.toFixed(1)}%`}
                    </strong>
                    <small>
                      {model.passed} / {model.count} correct
                    </small>
                    {model.missing > 0 && (
                      <small>{model.missing} missing results</small>
                    )}
                    {model.errors > 0 && <small>{model.errors} errors</small>}
                  </td>
                  {columns
                    .filter(
                      (column) =>
                        'unit' in column ||
                        column.key === 'economy' ||
                        column.key === 'balance',
                    )
                    .map((column) => {
                      if (column.key === 'balance') {
                        return (
                          <td key={column.key}>
                            {model.balance?.toFixed(1) ?? '—'}
                          </td>
                        );
                      }
                      const count =
                        column.key === 'economy'
                          ? model.economyCount
                          : model[column.key].count;
                      return (
                        <td key={column.key}>
                          {column.key === 'economy'
                            ? formatEconomy(model.economy)
                            : formatAverage(
                                model[column.key].average,
                                column.unit,
                              )}
                          {count !== model.count && (
                            <small>
                              {count} / {model.count} valid results
                            </small>
                          )}
                          {column.key === 'totalTokens' &&
                            (model.usage.partial > 0 ||
                              model.usage.missing > 0) && (
                              <small>
                                {model.usage.complete} complete ·{' '}
                                {model.usage.partial} partial ·{' '}
                                {model.usage.missing} missing usage
                              </small>
                            )}
                        </td>
                      );
                    })}
                  <td className="model-breakdown-reference">
                    <Reference model={model} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}

const matrixSymbols = { passed: '✓', failed: '×', error: '!', missing: '–' };

function TestcaseMatrix({
  matrix,
  onShowTestcase,
}: {
  matrix: ReportOverview['matrix'];
  onShowTestcase: (path: string) => void;
}) {
  const { search } = useLocation();
  const selectedModel = new URLSearchParams(search).get('model') ?? undefined;
  const [filter, setFilter] = useState('all');
  const { models, rows, counts, accuracyDeviation } = matrix;
  const visible =
    filter === 'all' ? rows : rows.filter((row) => row.status === filter);
  return (
    <section
      className="testcase-matrix"
      aria-labelledby="testcase-results-title"
    >
      <header className="testcase-matrix-heading">
        <div className="matrix-title">
          <h2 id="testcase-results-title">Testcase Overview</h2>
          <span
            className="matrix-accuracy-spread"
            title="Population standard deviation of model accuracy. Each model has equal weight. Filters do not change this value."
          >
            Accuracy Std. Dev.
            <strong>
              {accuracyDeviation === null ? '—' : accuracyDeviation.toFixed(2)}{' '}
              percentage points
            </strong>
          </span>
        </div>
        <div className="matrix-legend" aria-label="Result Colors">
          {(['passed', 'failed', 'error', 'missing'] as const).map((status) => (
            <span
              key={status}
              title={
                status === 'error'
                  ? 'No scorable answer. The request failed, timed out, or returned a response that could not be parsed.'
                  : undefined
              }
            >
              <span className={`matrix-swatch ${status}`} aria-hidden="true" />
              {resultStatusLabels[status]}
            </span>
          ))}
        </div>
      </header>
      <fieldset className="matrix-filters" aria-label="Filter testcase results">
        {(
          [
            { value: 'all', label: 'All testcases' },
            { value: 'all-passed', label: 'All passed' },
            { value: 'all-failed', label: 'All failed' },
            { value: 'incomplete', label: 'Missing results' },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="matrix-filter"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} ({counts[value]})
          </button>
        ))}
      </fieldset>
      <section
        className="matrix-scroll"
        aria-label="Testcase Overview"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The wide matrix supports keyboard scrolling.
        tabIndex={0}
      >
        <table
          className="result-matrix"
          style={{ minWidth: 284 + models.length * 84 }}
        >
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 64 }} />
            {models.map((model) => (
              <col key={model} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Testcase</th>
              <th scope="col">Passed</th>
              {models.map((model) => (
                <th key={model} scope="col" className="matrix-model">
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ name, cells, passed, status }) => (
              <tr key={name} data-status={status}>
                <th scope="row">
                  <button
                    type="button"
                    className="matrix-case-link"
                    aria-haspopup="dialog"
                    onClick={() =>
                      onShowTestcase(testcasePath(name, selectedModel))
                    }
                  >
                    {name}
                  </button>
                </th>
                <td className="matrix-pass-count">
                  <span title={`${passed} of ${models.length} models passed`}>
                    {passed} / {models.length}
                  </span>
                </td>
                {cells.map((outcome, index) => {
                  const label = `${name} · ${models[index]} · ${resultStatusLabels[outcome]}`;
                  return (
                    <td key={models[index]}>
                      <button
                        type="button"
                        className={`matrix-cell ${outcome}`}
                        aria-haspopup="dialog"
                        onClick={() =>
                          onShowTestcase(testcasePath(name, models[index]))
                        }
                        title={label}
                        aria-label={label}
                      >
                        {matrixSymbols[outcome]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {!visible.length && (
        <p className="list-empty">No testcases match this filter.</p>
      )}
    </section>
  );
}
