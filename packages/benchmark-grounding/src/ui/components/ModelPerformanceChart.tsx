import {
  type CSSProperties,
  createContext,
  memo,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';
import {
  CartesianGrid,
  type LabelProps,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  type ScatterShapeProps,
  Tooltip,
  XAxis,
  YAxis,
  ZIndexLayer,
  usePlotArea,
  useXAxisScale,
} from 'recharts';

import { median } from '../../summary';
import type { ModelSummary } from '../types';

function measureScatterLabel(
  model: string,
  icon: string | undefined,
  context: CanvasRenderingContext2D | null,
) {
  const inset = icon ? 36 : 16;
  const measure = (text: string) => {
    const metrics = context?.measureText(text);
    return metrics
      ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
      : Array.from(text).length * 6;
  };
  const characters = Array.from(model);
  const end =
    measure(model) + inset > 220
      ? characters.findIndex(
          (_, i) =>
            measure(`${characters.slice(0, i + 1).join('')}…`) + inset > 220,
        )
      : -1;
  const label = end < 0 ? model : `${characters.slice(0, end).join('')}…`;
  const metrics = context?.measureText(label);
  return {
    icon,
    label,
    width: Math.max(
      22,
      (metrics
        ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
        : measure(label)) + inset,
    ),
    textOffsetX: metrics?.actualBoundingBoxLeft ?? 0,
    textBaseline: metrics
      ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
      : 3,
  };
}

type ScatterPoint = {
  model: string;
  value: number;
  axisValue: number;
  score: number;
  estimatedCostUsd: number | null;
  color: string;
  icon?: string;
  label: string;
  width: number;
  textOffsetX: number;
  textBaseline: number;
};

const MatchingModelsContext = createContext<ReadonlySet<string>>(new Set());
// Keep one linear unit size outside explicitly marked empty intervals.
function createElapsedTimeAxis(values: number[], p50: number | null) {
  const anchors = [...new Set([...values, ...(p50 === null ? [] : [p50])])]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  // Normalize the units before measuring gaps, then accumulate the retained
  // intervals. Subtracting a huge removed gap would erase small clusters.
  const scale = anchors.at(-1) || 1;
  const normalized = [...new Set(anchors.map((value) => value / scale))];
  const minimum = normalized[0] ?? 0;
  const maximum = normalized.at(-1) ?? 1;
  const gaps = normalized.slice(1).map((value, index) => ({
    start: normalized[index],
    end: value,
    size: value - normalized[index],
  }));
  const sizes = gaps.map(({ size }) => size).sort((a, b) => a - b);
  const typicalGap = sizes[Math.floor((sizes.length - 1) / 2)] ?? 0;
  const folded = gaps
    .filter(({ size }) => size > typicalGap * 8)
    .map(({ start, end, size }) => {
      const shoulder = Math.min(size * 0.12, typicalGap * 2);
      return { start: start + shoulder, end: end - shoulder };
    });
  const intervals = folded.flatMap((gap, index) => [
    { start: folded[index - 1]?.end ?? minimum, end: gap.start, folded: false },
    { ...gap, folded: true },
  ]);
  intervals.push({
    start: folded.at(-1)?.end ?? minimum,
    end: maximum,
    folded: false,
  });
  const retainedSpan = intervals.reduce(
    (total, interval) =>
      total + (interval.folded ? 0 : interval.end - interval.start),
    0,
  );
  // Compress only empty intervals, retaining more space for larger gaps. Bound
  // their total width so extreme outliers still leave the main cluster readable.
  const foldedWidth = (size: number) =>
    Math.min(
      size * 0.5,
      typicalGap * (2 + Math.log2(size) - Math.log2(typicalGap)),
    );
  const foldedSpan = folded.reduce(
    (sum, gap) => sum + foldedWidth(gap.end - gap.start),
    0,
  );
  const foldedScale = Math.min(1, (retainedSpan * 0.5) / (foldedSpan || 1));
  const pieces = intervals.map((interval) => ({
    ...interval,
    width: interval.folded
      ? foldedWidth(interval.end - interval.start) * foldedScale
      : interval.end - interval.start,
  }));
  const totalWidth = pieces.reduce((sum, piece) => sum + piece.width, 0);
  const project = (value: number) => {
    const normalizedValue = value / scale;
    if (normalizedValue < minimum) return normalizedValue - minimum;
    let position = 0;
    for (const piece of pieces) {
      if (normalizedValue <= piece.end) {
        const length = piece.end - piece.start;
        return (
          position +
          (length
            ? ((normalizedValue - piece.start) / length) * piece.width
            : 0)
        );
      }
      position += piece.width;
    }
    return position + (normalizedValue - maximum);
  };
  const padding =
    (retainedSpan || typicalGap || maximum || 1) * 0.025 || Number.MIN_VALUE;
  const lower = Math.max(0, minimum - padding);
  const upperPadding = totalWidth > 0 ? 0 : padding;
  const upper = maximum + upperPadding;
  const domain = [lower - minimum, totalWidth + upperPadding];
  const targetStep = Math.max((domain[1] - domain[0]) / 8, Number.MIN_VALUE);
  const magnitude =
    10 ** Math.floor(Math.log10(targetStep)) || Number.MIN_VALUE;
  const step =
    ([1, 2, 5, 10].find((factor) => factor * magnitude >= targetStep) ?? 10) *
    magnitude;
  const candidates = [
    ...new Set(
      intervals
        .filter((interval) => !interval.folded)
        .flatMap((interval, index, kept) => {
          const start = index === 0 ? lower : interval.start;
          const end = index === kept.length - 1 ? upper : interval.end;
          const first = Math.ceil(start / step) * step;
          const count = Math.min(
            10,
            Math.max(0, Math.floor((end - first) / step) + 1),
          );
          const regular = Array.from(
            { length: count },
            (_, i) => (first + i * step) * scale,
          ).filter((value) => value / scale >= start && value / scale <= end);
          return regular.length
            ? regular
            : [
                anchors.find(
                  (value) => value / scale >= start && value / scale <= end,
                ) ?? ((start + end) / 2) * scale,
              ];
        })
        .filter((value) => Number.isFinite(value) && value >= 0),
    ),
  ]
    .map((value) => ({ value, position: project(value) }))
    .sort((a, b) => a.position - b.position);
  // Keep tick work and label density bounded even with many isolated clusters.
  const ticks =
    candidates.length <= 9
      ? candidates
      : [
          ...new Set(
            Array.from({ length: 9 }, (_, i) => {
              const target = domain[0] + ((domain[1] - domain[0]) * i) / 8;
              return candidates.reduce((best, tick) =>
                Math.abs(tick.position - target) <
                Math.abs(best.position - target)
                  ? tick
                  : best,
              );
            }),
          ),
        ];
  const tickMagnitude = Math.log10(step) + Math.log10(scale);
  const digits = Math.min(12, Math.max(2, -Math.floor(tickMagnitude)));
  const formatTick = (value: number) =>
    value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e9)
      ? value.toExponential(
          Math.min(
            16,
            Math.max(2, Math.ceil(Math.log10(Math.abs(value)) - tickMagnitude)),
          ),
        )
      : value.toLocaleString('en-US', { maximumFractionDigits: digits });
  return {
    breaks: folded.map(({ start, end }) => ({
      start: start * scale,
      end: end * scale,
    })),
    project,
    ticks,
    domain,
    formatTick,
  };
}

function ElapsedTimeAxisBreaks({
  axis,
}: { axis: ReturnType<typeof createElapsedTimeAxis> }) {
  const plot = usePlotArea();
  const scale = useXAxisScale();
  if (!plot || !scale) return null;
  return (
    <ZIndexLayer zIndex={550}>
      <g className="elapsed-time-axis-breaks" pointerEvents="none">
        {axis.breaks.map(({ start, end }) => {
          const left = scale(axis.project(start));
          const right = scale(axis.project(end));
          if (left === undefined || right === undefined) return null;
          const center = (left + right) / 2;
          return (
            <g key={start} data-break-start={start} data-break-end={end}>
              <title>
                Axis break: {axis.formatTick(start)}–{axis.formatTick(end)} s
              </title>
              <rect
                x={left}
                y={plot.y - 1}
                width={right - left}
                height={plot.height + 2}
                fill="#fff"
                fillOpacity={1}
              />
              {[left, right].map((x) => (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={plot.y}
                  y2={plot.y + plot.height}
                  stroke="#cbd5e1"
                  strokeDasharray="2 5"
                />
              ))}
              {[plot.y, plot.y + plot.height].map((y) => (
                <path
                  key={y}
                  d={`M ${center - 7} ${y + 5} l 6 -10 M ${center + 1} ${y + 5} l 6 -10`}
                  stroke="#64748b"
                  strokeWidth={1.5}
                  fill="none"
                />
              ))}
            </g>
          );
        })}
      </g>
    </ZIndexLayer>
  );
}

const ModelScatterLayer = memo(function ModelScatterLayer({
  points,
  formatTime,
}: {
  points: ScatterPoint[];
  formatTime: (value: number) => string;
}) {
  const matchingModels = useContext(MatchingModelsContext);
  const renderPoint = ({ cx, cy, payload, isActive }: ScatterShapeProps) => {
    if (cx === undefined || cy === undefined) return null;
    const point = payload as ScatterPoint;
    const matchesFilters = matchingModels.has(point.model);
    const active = isActive && matchesFilters;
    const color = matchesFilters ? point.color : '#94a3b8';
    const radius = active ? 6 : 4.5;
    const labelScale = active ? 1.12 : 1;
    const labelTop = cy + 14;
    return (
      <g
        className="scatter-model"
        data-model={point.model}
        data-matches-filters={matchesFilters}
        pointerEvents={matchesFilters ? undefined : 'none'}
      >
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        <line
          x1={cx}
          x2={cx}
          y1={cy}
          y2={labelTop}
          stroke="transparent"
          strokeWidth={10}
        />
        <line
          className="scatter-model-connector"
          x1={cx}
          x2={cx}
          y1={cy + radius + 0.75}
          y2={labelTop - 11 * (labelScale - 1) - 0.75 * labelScale}
          stroke={color}
          strokeWidth={active ? 2.4 : 1.4}
        />
        <circle
          className="scatter-model-dot"
          cx={cx}
          cy={cy}
          r={radius}
          fill={color}
          stroke="#fff"
          strokeWidth={1.5}
        />
        <g
          className="scatter-model-label"
          transform={`translate(${cx - point.width / 2}, ${labelTop})`}
        >
          <g className="scatter-model-label-inner" data-active={active}>
            <rect
              width={point.width}
              height={22}
              rx={11}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
            />
            <g transform="translate(6, 11)">
              {point.icon && (
                <>
                  <circle cx={7} cy={0} r={7} fill="#fff" />
                  <image
                    href={point.icon}
                    x={1}
                    y={-6}
                    width={12}
                    height={12}
                  />
                </>
              )}
              <text
                x={(point.icon ? 20 : 0) + point.textOffsetX}
                y={point.textBaseline}
                textAnchor="start"
                dominantBaseline="alphabetic"
                fill="#fff"
                fontFamily="system-ui, sans-serif"
                fontSize={11}
                fontWeight={600}
              >
                {point.label}
              </text>
            </g>
          </g>
        </g>
      </g>
    );
  };
  return (
    <>
      <Tooltip
        cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
        isAnimationActive={false}
        content={({ active, payload }) => {
          const point = active
            ? (payload?.[0]?.payload as ScatterPoint | undefined)
            : undefined;
          if (!point || !matchingModels.has(point.model)) return null;
          const coincident = points.filter(
            (other) =>
              other.value === point.value && other.score === point.score,
          );
          return (
            <div className="performance-tooltip">
              <strong>{point.model}</strong>
              <dl>
                <div>
                  <dt>Score</dt>
                  <dd>
                    {point.score.toLocaleString('en-US', {
                      maximumFractionDigits: 1,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Estimated Model Duration Avg.</dt>
                  <dd>
                    {formatTime(point.value)} <span>s</span>
                  </dd>
                </div>
                <div>
                  <dt>Estimated Cost Avg.</dt>
                  <dd>
                    {point.estimatedCostUsd === null
                      ? 'Unavailable'
                      : point.estimatedCostUsd.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          minimumFractionDigits: 6,
                          maximumFractionDigits: 6,
                        })}
                  </dd>
                </div>
              </dl>
              {coincident.length > 1 && (
                <p>
                  Models at this position:{' '}
                  {coincident.map((other) => other.model).join(', ')}
                </p>
              )}
            </div>
          );
        }}
      />
      <Scatter
        className="model-scatter-series"
        data={points}
        dataKey="axisValue"
        isAnimationActive={false}
        zIndex={579}
        shape={renderPoint}
        activeShape={renderPoint}
      />
    </>
  );
});

export function ModelPerformanceChart({ models }: { models: ModelSummary[] }) {
  const [selectedModels, setSelectedModels] = useState<
    string[] | 'family-glory' | null
  >(null);
  const [selectedFamilies, setSelectedFamilies] = useState<string[] | null>(
    null,
  );
  const [budgetCases, setBudgetCases] = useState<number | null>(null);
  const budgetId = useId();
  const families = useMemo(
    () =>
      [...new Set(models.map(({ family }) => family))].sort((a, b) =>
        a.localeCompare(b, 'en'),
      ),
    [models],
  );
  const activeModels = useMemo(() => {
    if (selectedModels !== 'family-glory') return selectedModels;
    const winners = new Map<string, typeof models>();
    for (const model of models) {
      if (model.score === null || !Number.isFinite(model.score)) continue;
      const familyWinners = winners.get(model.family);
      const best = familyWinners?.[0];
      const comparison = best
        ? model.score - (best.score ?? Number.NEGATIVE_INFINITY) ||
          (model.speed ?? Number.NEGATIVE_INFINITY) -
            (best.speed ?? Number.NEGATIVE_INFINITY) ||
          (best.estimatedCost.average ?? Number.POSITIVE_INFINITY) -
            (model.estimatedCost.average ?? Number.POSITIVE_INFINITY)
        : 1;
      if (comparison > 0) winners.set(model.family, [model]);
      else if (!comparison) familyWinners?.push(model);
    }
    return [...winners.values()].flatMap((family) =>
      family.map(({ model }) => model),
    );
  }, [models, selectedModels]);
  const [minimumCases, maximumCases] = useMemo(() => {
    const values = models.flatMap(({ affordability }) =>
      affordability !== null &&
      Number.isFinite(affordability) &&
      affordability > 0
        ? [affordability]
        : [],
    );
    return values.length
      ? [
          Math.floor(Math.min(...values) / 5) * 5,
          Math.ceil(Math.max(...values) / 1000) * 1000,
        ]
      : [0, 0];
  }, [models]);
  const budgetTarget = Math.max(
    minimumCases,
    Math.min(budgetCases ?? minimumCases, maximumCases),
  );
  const requiredCases = Math.round(budgetTarget);
  const budgetOffset = minimumCases === 0 ? 1 : 0;
  const budgetScale = {
    min: Math.log(minimumCases + budgetOffset),
    max: Math.log(maximumCases + budgetOffset),
    value: Math.log(budgetTarget + budgetOffset),
  };
  const matchingModels = useMemo(
    () =>
      new Set(
        models
          .filter(
            ({ model, family, estimatedCost }) =>
              estimatedCost.average !== null &&
              Number.isFinite(estimatedCost.average) &&
              estimatedCost.average >= 0 &&
              requiredCases * estimatedCost.average <= 1 &&
              (selectedFamilies === null ||
                selectedFamilies.includes(family)) &&
              (activeModels === null || activeModels.includes(model)),
          )
          .map(({ model }) => model),
      ),
    [models, requiredCases, selectedFamilies, activeModels],
  );
  const dimensions = useMemo(
    () =>
      [
        { label: 'Score', key: 'score' as const, unit: '' },
        {
          label: 'Affordability',
          key: 'affordability' as const,
          unit: 'cases / $1',
        },
        {
          label: 'Speed',
          key: 'speed' as const,
          unit: 'cases / min',
        },
      ].map((dimension) => {
        const values = models
          .map((model) => model[dimension.key])
          .filter(
            (value): value is number =>
              value !== null &&
              Number.isFinite(value) &&
              (dimension.key === 'score'
                ? value >= 0 && value <= 100
                : value > 0),
          )
          .sort((a, b) => a - b);
        return {
          ...dimension,
          minimum: dimension.key === 'score' ? 60 : values[0],
          maximum: dimension.key === 'score' ? 100 : values.at(-1),
          p50: median(values),
        };
      }),
    [models],
  );
  const hasReference = dimensions.every(({ p50 }) => p50 !== null);
  const elapsedTimes = useMemo(
    () =>
      models
        .map(({ estimatedElapsedTime }) => estimatedElapsedTime.average)
        .filter(
          (value): value is number =>
            value !== null && Number.isFinite(value) && value >= 0,
        )
        .map((value) => value / 1000),
    [models],
  );
  const elapsedTimeP50 = median(elapsedTimes);
  const scoreP50 = dimensions[0].p50;
  const scoreDomain = useMemo(() => {
    const values = models
      .map(({ score }) => score)
      .filter(
        (value): value is number =>
          value !== null &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 100,
      );
    if (!values.length) return [0, 100];
    return [Math.max(0, Math.floor(Math.min(...values) + 1e-9) - 1), 100];
  }, [models]);
  const axis = useMemo(
    () => createElapsedTimeAxis(elapsedTimes, elapsedTimeP50),
    [elapsedTimes, elapsedTimeP50],
  );
  const points = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context) context.font = '600 11px system-ui, sans-serif';
    return models
      .flatMap((item) => {
        const value =
          item.estimatedElapsedTime.average === null
            ? null
            : item.estimatedElapsedTime.average / 1000;
        return value !== null &&
          Number.isFinite(value) &&
          value >= 0 &&
          item.score !== null &&
          item.score >= 0 &&
          item.score <= 100
          ? [
              {
                model: item.model,
                value,
                axisValue: axis.project(value),
                score: item.score,
                estimatedCostUsd: item.estimatedCost.average,
                color: item.color,
                ...measureScatterLabel(item.model, item.icon, context),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          a.score - b.score ||
          b.value - a.value ||
          (b.estimatedCostUsd ?? Number.POSITIVE_INFINITY) -
            (a.estimatedCostUsd ?? Number.POSITIVE_INFINITY) ||
          a.model.localeCompare(b.model),
      );
  }, [models, axis]);
  const scatterAxisPadding = useMemo(() => {
    const [leftEdge, rightEdge] = axis.domain;
    const edgeSpan = (rightEdge - leftEdge) * 0.1;
    return {
      left: Math.min(
        36,
        Math.ceil(
          points.reduce(
            (padding, point) =>
              point.axisValue <= leftEdge + edgeSpan
                ? Math.max(padding, point.width / 2 + 4)
                : padding,
            12,
          ),
        ),
      ),
      right: 30,
    };
  }, [points, axis.domain]);
  const radarModels = useMemo(
    () =>
      models.map((model) => {
        const data = dimensions.map(({ label, key, minimum, maximum, p50 }) => {
          const [value, reference] = [model[key], p50].map((value) =>
            value === null ||
            !Number.isFinite(value) ||
            maximum === undefined ||
            minimum === undefined ||
            (key !== 'score' && value <= 0)
              ? null
              : key === 'score'
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      ((value - minimum) / (maximum - minimum)) * 100,
                    ),
                  )
                : maximum === minimum
                  ? 100
                  : ((Math.log10(value) - Math.log10(minimum)) /
                      (Math.log10(maximum) - Math.log10(minimum))) *
                    100,
          );
          return { metric: label, value, p50: reference };
        });
        const available = data.every((dimension) => dimension.value !== null);
        const title = [
          model.model,
          ...dimensions.map(
            ({ label, key, unit }) =>
              `${label}: ${model[key] === null ? 'Unavailable' : model[key].toLocaleString('en-US', { maximumFractionDigits: key === 'score' ? 1 : 0 })}${unit ? ` ${unit}` : ''}`,
          ),
          ...(!available
            ? [
                model.estimatedElapsedTime.average === 0 ||
                model.estimatedCost.average === 0
                  ? 'Cost or duration is zero; rate unavailable'
                  : !model.reference
                    ? 'Missing pricing and performance data'
                    : model.usage.complete === 0
                      ? 'No complete token usage'
                      : 'Cost or speed estimate unavailable',
              ]
            : []),
        ].join('\n');
        return { ...model, data, available, title };
      }),
    [models, dimensions],
  );
  const legend = useMemo(
    () => (
      <ul className="model-performance-legend" aria-label="Models">
        {radarModels.map((model) => (
          <MatchingModelsContext.Consumer key={model.model}>
            {(matchingModels) => (
              <li>
                <button
                  data-matches-filters={matchingModels.has(model.model)}
                  type="button"
                  className="performance-model-toggle"
                  aria-label={model.model}
                  aria-pressed={
                    activeModels === null || activeModels.includes(model.model)
                  }
                  title={model.title}
                  onClick={() =>
                    setSelectedModels(
                      activeModels === null
                        ? [model.model]
                        : activeModels.includes(model.model)
                          ? activeModels.filter((name) => name !== model.model)
                          : [...activeModels, model.model],
                    )
                  }
                >
                  <span className="performance-model-heading">
                    <span
                      className="performance-swatch"
                      style={{ background: model.color }}
                      aria-hidden="true"
                    />
                    <strong>{model.model}</strong>
                  </span>
                  <div className="performance-mini-radar">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                    >
                      <RadarChart
                        data={model.data}
                        outerRadius="95%"
                        cy="60%"
                        margin={{ top: 12, right: 12, bottom: 4, left: 12 }}
                        accessibilityLayer={false}
                        role="img"
                        aria-label={`${model.model}: Score, Affordability and Speed. Score uses 60–100; Affordability and Speed use shared logarithmic ranges.`}
                      >
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={({ x, y, payload }) => (
                            <text
                              x={x}
                              y={y}
                              textAnchor="middle"
                              fill="#64748b"
                              fontSize={9}
                              dy={payload.index === 0 ? 0 : 11}
                            >
                              {payload.value}
                            </text>
                          )}
                          tickLine={false}
                        />
                        <PolarRadiusAxis
                          domain={[0, 100]}
                          allowDataOverflow
                          ticks={[0, 25, 50, 75, 100]}
                          tick={false}
                          tickLine={false}
                          axisLine={false}
                        />
                        {model.available && (
                          <Radar
                            name={model.model}
                            dataKey="value"
                            stroke={model.color}
                            fill={model.color}
                            fillOpacity={0.16}
                            strokeWidth={1.8}
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                          />
                        )}
                        {hasReference && (
                          <Radar
                            name="P50 Reference"
                            dataKey="p50"
                            stroke="#64748b"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            fill="none"
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                            pointerEvents="none"
                          />
                        )}
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </button>
              </li>
            )}
          </MatchingModelsContext.Consumer>
        ))}
      </ul>
    ),
    [radarModels, hasReference, activeModels],
  );

  // Keep scatter nodes mounted during filter changes so CSS transitions can run.
  const scatterPlot = useMemo(() => {
    const references = [
      ...(elapsedTimeP50 === null
        ? []
        : [
            {
              axis: 'x' as const,
              value: axis.project(elapsedTimeP50),
              label: `P50: ${axis.formatTick(elapsedTimeP50)} s`,
            },
          ]),
      ...(scoreP50 === null
        ? []
        : [
            {
              axis: 'y' as const,
              value: scoreP50,
              label: `P50: ${scoreP50.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
            },
          ]),
    ];
    return (
      <div className="model-scatter-plot">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ScatterChart
            margin={{ top: 40, right: 16, bottom: 38, left: 16 }}
            accessibilityLayer
            aria-label={`Model Performance Overview: Estimated Model Duration Avg. in seconds on a linear horizontal axis with marked breaks across large empty intervals; Score from ${scoreDomain[0]} to ${scoreDomain[1]}`}
          >
            <CartesianGrid stroke="#e8edf4" strokeDasharray="3 5" />
            <XAxis
              type="number"
              dataKey="axisValue"
              scale="linear"
              domain={axis.domain}
              allowDataOverflow
              ticks={axis.ticks.map(({ position }) => position)}
              interval="preserveStartEnd"
              padding={scatterAxisPadding}
              tick={{ fill: '#748195', fontSize: 11 }}
              tickFormatter={(position: number) =>
                axis.formatTick(
                  axis.ticks.find((tick) => tick.position === position)
                    ?.value ?? position,
                )
              }
              tickLine={false}
              axisLine={{ stroke: '#dce4ee' }}
              tickMargin={16}
              height={56}
              label={{
                position: 'insideBottom',
                offset: -12,
                content: ({ viewBox, y }: LabelProps) => {
                  if (!viewBox || !('x' in viewBox)) return null;
                  return (
                    <g
                      className="duration-axis-labels"
                      fill="#526176"
                      fontSize={11}
                    >
                      <text x={viewBox.x} y={y} textAnchor="start">
                        ← Faster 🚀
                      </text>
                      <text
                        x={viewBox.x + viewBox.width / 2}
                        y={y}
                        textAnchor="middle"
                      >
                        Estimated Model Duration Avg. (sec)
                      </text>
                      <text
                        x={viewBox.x + viewBox.width}
                        y={y}
                        textAnchor="end"
                      >
                        🐌 Slower →
                      </text>
                    </g>
                  );
                },
              }}
            />
            <YAxis
              orientation="left"
              type="number"
              dataKey="score"
              domain={scoreDomain}
              ticks={(() => {
                const step = scoreDomain[1] - scoreDomain[0] <= 10 ? 1 : 5;
                const first =
                  Math.ceil(Math.max(0, scoreDomain[0]) / step) * step;
                const last = Math.min(100, scoreDomain[1]);
                const ticks = Array.from(
                  {
                    length: Math.max(0, Math.floor((last - first) / step) + 1),
                  },
                  (_, index) => first + index * step,
                );
                return [
                  scoreDomain[0],
                  ...ticks.filter((tick) => tick - scoreDomain[0] >= step / 2),
                ];
              })()}
              tick={{ fill: '#748195', fontSize: 11 }}
              tickFormatter={(value: number) => value.toLocaleString('en-US')}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={64}
              label={{
                value: 'Score',
                angle: -90,
                position: 'insideLeft',
                fill: '#526176',
                fontSize: 11,
              }}
            />
            {references.map(({ axis, value, label }) => (
              <ReferenceLine
                key={axis}
                x={axis === 'x' ? value : undefined}
                y={axis === 'y' ? value : undefined}
                zIndex={560}
                stroke="#64748b"
                strokeDasharray="6 4"
                strokeWidth={1}
                label={{
                  value: label,
                  position:
                    axis === 'x' ? 'insideBottomRight' : 'insideTopRight',
                  fill: '#334155',
                  fontSize: 11,
                  offset: 8,
                }}
              />
            ))}
            <ElapsedTimeAxisBreaks axis={axis} />
            <ModelScatterLayer points={points} formatTime={axis.formatTick} />
          </ScatterChart>
        </ResponsiveContainer>
        {!points.length && (
          <p className="performance-hidden-message">
            No model has a valid estimated model duration and score.
          </p>
        )}
      </div>
    );
  }, [axis, scoreDomain, scatterAxisPadding, elapsedTimeP50, scoreP50, points]);

  return (
    <section className="model-performance">
      <header className="model-performance-heading">
        <h3>Model Performance Overview</h3>
      </header>
      <MatchingModelsContext.Provider value={matchingModels}>
        <div className="model-performance-canvas">
          <div className="model-scatter-viewport">{scatterPlot}</div>
          <aside className="model-performance-models" aria-label="Filters">
            <div className="model-filters-heading">
              <h4>Filters</h4>
              <button
                type="button"
                className="model-filter-reset"
                onClick={() => {
                  setBudgetCases(null);
                  setSelectedFamilies(null);
                  setSelectedModels(null);
                }}
              >
                Clear all
              </button>
            </div>
            <section
              className="model-filter-section scatter-budget"
              aria-label="Budget"
            >
              <h5 className="model-filter-title">Budget</h5>
              <div className="scatter-budget-heading">
                <label htmlFor={budgetId}>
                  Expecting to run{' '}
                  <output htmlFor={budgetId}>
                    {requiredCases.toLocaleString('en-US')}
                  </output>{' '}
                  cases within $1
                </label>
              </div>
              <input
                id={budgetId}
                className="scatter-budget-slider"
                type="range"
                min={budgetScale.min}
                max={budgetScale.max}
                step="any"
                value={budgetScale.value}
                disabled={minimumCases === maximumCases}
                aria-label="Cases to Run Within $1"
                aria-valuemin={minimumCases}
                aria-valuemax={maximumCases}
                aria-valuenow={requiredCases}
                aria-valuetext={`${requiredCases.toLocaleString('en-US')} cases within $1`}
                onChange={(event) =>
                  setBudgetCases(
                    Math.exp(event.currentTarget.valueAsNumber) - budgetOffset,
                  )
                }
                style={
                  {
                    '--budget-progress': `${maximumCases === minimumCases ? 0 : ((budgetScale.value - budgetScale.min) / (budgetScale.max - budgetScale.min)) * 100}%`,
                  } as CSSProperties
                }
              />
              <div className="scatter-budget-scale">
                <span>{minimumCases.toLocaleString('en-US')} cases</span>
                <span>{maximumCases.toLocaleString('en-US')} cases</span>
              </div>
            </section>
            <section className="model-filter-section" aria-label="Family">
              <h5 className="model-filter-title">
                Family
                <button
                  type="button"
                  role="switch"
                  className="model-family-glory"
                  aria-checked={selectedModels === 'family-glory'}
                  title="Select each family's best models by higher score, then higher speed, then lower cost; exact ties are included"
                  onClick={() =>
                    setSelectedModels((current) =>
                      current === 'family-glory' ? null : 'family-glory',
                    )
                  }
                >
                  Family Glory
                  <span
                    className="model-family-glory-switch"
                    aria-hidden="true"
                  />
                </button>
              </h5>
              <div className="model-family-options">
                <button
                  type="button"
                  aria-pressed={selectedFamilies === null}
                  onClick={() => {
                    setSelectedFamilies(null);
                    setSelectedModels(null);
                  }}
                >
                  All
                </button>
                {families.map((family) => (
                  <button
                    key={family}
                    type="button"
                    aria-pressed={
                      selectedFamilies === null ||
                      selectedFamilies.includes(family)
                    }
                    onClick={() => {
                      setSelectedFamilies((current) =>
                        current === null
                          ? [family]
                          : current.includes(family)
                            ? current.filter((name) => name !== family)
                            : [...current, family],
                      );
                      setSelectedModels(null);
                    }}
                  >
                    {family}
                  </button>
                ))}
              </div>
            </section>
            <section
              className="model-filter-section model-filter-models"
              aria-label="Model"
            >
              <h5 className="model-filter-title">
                Model
                <span className="model-filter-actions">
                  <span className="model-selection-count">
                    {matchingModels.size} / {models.length}
                  </span>
                  <button
                    type="button"
                    className="model-filter-reset"
                    onClick={() => setSelectedModels(null)}
                  >
                    All models
                  </button>
                </span>
              </h5>
              {legend}
            </section>
          </aside>
        </div>
      </MatchingModelsContext.Provider>
    </section>
  );
}
