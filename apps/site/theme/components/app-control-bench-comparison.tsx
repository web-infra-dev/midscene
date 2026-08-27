import { APP_CONTROL_BENCH_RUNS } from './app-control-bench-data';

const SEGMENT_COUNT = 20;

interface ChartRow {
  key: string;
  label: string;
  value: number;
}

interface SegmentedChartProps {
  ariaLabel: string;
  maxValue: number;
  rows: readonly ChartRow[];
  subtitle: string;
  title: string;
  valueSuffix?: string;
}

const COMPARISON_COPY = {
  en: {
    costTitle: 'Cases completed per $1',
    costSubtitle:
      'Completion = Pass + 0.5 × Partial. Each row is one Midscene model; higher is better.',
    costAriaLabel:
      'Cases completed per dollar by Midscene model, higher is better',
    passTitle: 'Pass@1 on the same 60 cases',
    passSubtitle:
      '30 Bluesky + 30 Element iOS cases, one attempt per model; higher is better.',
    passAriaLabel:
      'Pass at one on the same 60 cases by Midscene model, higher is better',
  },
  zh: {
    costTitle: '每 $1 完成的 case 数',
    costSubtitle:
      'Completion = Pass + 0.5 × Partial；每行代表一个 Midscene 模型，越高越好。',
    costAriaLabel: 'Midscene 不同模型每 1 美元完成的 case 数，越高越好',
    passTitle: '同一批 60 个 case 的 Pass@1',
    passSubtitle:
      '30 个 Bluesky + 30 个 Element iOS case，每个模型单次尝试，越高越好。',
    passAriaLabel: 'Midscene 不同模型在同一批 60 个 case 上的 Pass@1，越高越好',
  },
} as const;

function getSegmentFill(value: number, maxValue: number, index: number) {
  const filledSegments = (value / maxValue) * SEGMENT_COUNT;
  return Math.max(0, Math.min(1, filledSegments - index));
}

function SegmentedChart({
  ariaLabel,
  maxValue,
  rows,
  subtitle,
  title,
  valueSuffix = '',
}: SegmentedChartProps) {
  return (
    <article className="app-control-comparison-card">
      <header className="app-control-comparison-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div aria-label={ariaLabel} className="app-control-chart" role="img">
        {rows.map((row) => (
          <div className="app-control-chart-row" key={row.key}>
            <div className="app-control-chart-label">
              <strong>{row.label}</strong>
            </div>
            <div aria-hidden="true" className="app-control-chart-segments">
              {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
                const fill = getSegmentFill(row.value, maxValue, index);

                return (
                  <span className="app-control-chart-segment" key={index}>
                    <span
                      className="app-control-chart-segment-fill"
                      style={{ width: `${fill * 100}%` }}
                    />
                  </span>
                );
              })}
            </div>
            <strong className="app-control-chart-value">
              {row.value.toFixed(1)}
              {valueSuffix}
            </strong>
          </div>
        ))}
      </div>
    </article>
  );
}

interface AppControlBenchComparisonProps {
  locale: keyof typeof COMPARISON_COPY;
}

export function AppControlBenchComparison({
  locale,
}: AppControlBenchComparisonProps) {
  const copy = COMPARISON_COPY[locale];
  const costEfficiencyRows: ChartRow[] = APP_CONTROL_BENCH_RUNS.map((run) => ({
    key: run.id,
    label: run.modelName,
    value:
      (run.summary.passCount + run.summary.partialCount * 0.5) /
      run.summary.totalUsd,
  })).sort((left, right) => right.value - left.value);
  const passRateRows: ChartRow[] = APP_CONTROL_BENCH_RUNS.map((run) => ({
    key: run.id,
    label: run.modelName,
    value: run.summary.passAt1,
  }));

  return (
    <>
      <style>{`
.app-control-comparison {
  display: grid;
  gap: 18px;
  margin: 28px 0 36px;
}

.app-control-comparison-card {
  margin: 0;
  border: 1px solid #24283a;
  border-radius: 18px;
  padding: 24px;
  color: #f8fafc;
  background: #090b14;
}

.app-control-comparison-header {
  margin-bottom: 22px;
}

.app-control-comparison-header h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 22px;
  line-height: 1.3;
}

.app-control-comparison-header p {
  margin: 7px 0 0;
  color: #aeb5c8;
  font-size: 13px;
  line-height: 1.55;
}

.app-control-chart {
  display: grid;
  gap: 14px;
}

.app-control-chart-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.9fr) minmax(190px, 1.45fr) 58px;
  gap: 12px;
  align-items: center;
}

.app-control-chart-label {
  min-width: 0;
}

.app-control-chart-label strong {
  display: block;
  overflow-wrap: anywhere;
  color: #f8fafc;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}

.app-control-chart-segments {
  display: grid;
  grid-template-columns: repeat(${SEGMENT_COUNT}, minmax(0, 1fr));
  gap: 3px;
}

.app-control-chart-segment {
  display: block;
  height: 24px;
  overflow: hidden;
  border: 1px solid #222739;
  border-radius: 4px;
  background: #111520;
}

.app-control-chart-segment-fill {
  display: block;
  height: 100%;
  background: #4f7cff;
}

.app-control-chart-value {
  color: #f8fafc;
  font-size: 17px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .app-control-comparison-card {
    padding: 18px;
  }

  .app-control-comparison-header h3 {
    font-size: 19px;
  }

  .app-control-chart-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
  }

  .app-control-chart-segments {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .app-control-chart-value {
    grid-column: 2;
    grid-row: 1;
  }
}
`}</style>

      <section
        aria-label={`${copy.costTitle}; ${copy.passTitle}`}
        className="app-control-comparison"
      >
        <SegmentedChart
          ariaLabel={copy.costAriaLabel}
          maxValue={200}
          rows={costEfficiencyRows}
          subtitle={copy.costSubtitle}
          title={copy.costTitle}
        />
        <SegmentedChart
          ariaLabel={copy.passAriaLabel}
          maxValue={100}
          rows={passRateRows}
          subtitle={copy.passSubtitle}
          title={copy.passTitle}
          valueSuffix="%"
        />
      </section>
    </>
  );
}
