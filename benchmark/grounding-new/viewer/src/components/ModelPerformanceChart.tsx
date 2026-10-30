import {
  type CSSProperties,
  createContext,
  memo,
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
  useYAxisScale,
} from 'recharts';
import { modelFamilyColors } from '../metadata/model-colors';

const scatterAxisPadding = { left: 0, right: 12 };

const modelFamilyNames = {
  gpt: 'GPT',
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  doubao: 'Doubao',
  kimi: 'Kimi',
  typesafe: 'Jev',
  jev: 'Jev',
  gemini: 'Gemini',
  glm: 'GLM',
  llama: 'Llama',
  'meta-llama': 'Llama',
  mistral: 'Mistral',
  grok: 'Grok',
};

const modelLogos = {
  gpt: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/openai.svg',
  qwen: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/qwen-color.svg',
  deepseek:
    'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/deepseek-color.svg',
  doubao:
    'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/doubao-color.svg',
  kimi: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/kimi.svg',
  gemini:
    'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.95.1/icons/gemini-color.svg',
  typesafe:
    'https://framerusercontent.com/images/aNFzSFxM4fjICmnibw7npfZjcQ.png',
  jev: 'https://framerusercontent.com/images/aNFzSFxM4fjICmnibw7npfZjcQ.png',
} as const;

const MatchingModelsContext = createContext<ReadonlySet<string>>(new Set());

const ModelScatter = memo(function ModelScatter({
  points,
  references,
}: {
  points: {
    model: string;
    modelId: string;
    value: number;
    axisValue: number;
    passRate: number;
    estimatedCostUsd: number | null;
    color: string;
  }[];
  references: { axis: 'x' | 'y'; value: number; label: string }[];
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const labelContext = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context) context.font = '600 11px system-ui, sans-serif';
    return context;
  }, []);
  const referenceContext = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context)
      context.font = `11px ${getComputedStyle(document.body).fontFamily}`;
    return context;
  }, []);
  const annotations = points.flatMap((point) => {
    const cx = xScale?.(point.axisValue);
    const cy = yScale?.(point.passRate);
    if (cx === undefined || cy === undefined) return [];
    const icon = Object.entries(modelLogos).find(([family]) =>
      point.modelId
        .trim()
        .toLowerCase()
        .replace(/^.*\//, '')
        .replace(/^openai_/, '')
        .startsWith(family),
    )?.[1];
    const name = point.model
      .replace(/^openai_/i, '')
      .replace(/^(?:doubao-seed-|deepseek-|gpt-|qwen-?|kimi-|gemini-)/i, '')
      .replace(/-\d{6,8}$/, '')
      .replace(/(?<=\d)-(?=\d)/g, '.')
      .replaceAll('-', ' ');
    const label = name.length > 24 ? `${name.slice(0, 23)}…` : name;
    const textMetrics = labelContext?.measureText(label);
    return [
      {
        ...point,
        cx,
        cy,
        icon,
        label,
        textOffsetX: textMetrics?.actualBoundingBoxLeft ?? 0,
        textBaseline: textMetrics
          ? (textMetrics.actualBoundingBoxAscent -
              textMetrics.actualBoundingBoxDescent) /
            2
          : 3,
        width:
          (textMetrics
            ? textMetrics.actualBoundingBoxLeft +
              textMetrics.actualBoundingBoxRight
            : label.length * 6) + (icon ? 36 : 16),
      },
    ];
  });
  const placed: ((typeof annotations)[number] & {
    labelX: number;
    labelY: number;
    height: number;
  })[] = [];
  if (plot) {
    const referenceLabels = references.map(({ axis, value, label }) => {
      const right =
        (axis === 'x' ? (xScale?.(value) ?? plot.x) : plot.x + plot.width) - 8;
      const top = (axis === 'x' ? plot.y : (yScale?.(value) ?? plot.y)) + 8;
      const metrics = referenceContext?.measureText(label);
      const width = metrics?.width ?? label.length * 6;
      const ascent = metrics?.fontBoundingBoxAscent ?? 11;
      const descent = metrics?.fontBoundingBoxDescent ?? 3;
      return {
        labelX: right - width,
        // Recharts' top-anchored text adds 0.71em to the first baseline.
        labelY: top + 11 * 0.71 - ascent,
        width,
        height: ascent + descent,
      };
    });
    for (const point of annotations.sort(
      (a, b) => a.cy - b.cy || a.cx - b.cx,
    )) {
      const candidates = [12, 16, 24, 36, 52, 76, 104, 144, 190].flatMap(
        (gap) =>
          [
            [point.cx - point.width / 2, point.cy + gap],
            [point.cx + gap, point.cy - 12],
            [point.cx - point.width - gap, point.cy - 12],
            [point.cx - point.width / 2, point.cy - 24 - gap],
            [point.cx + gap, point.cy - 24 - gap],
            [point.cx - point.width - gap, point.cy - 24 - gap],
            [point.cx + gap, point.cy + gap],
            [point.cx - point.width - gap, point.cy + gap],
          ].map(([x, y], position) => {
            // Scatter's clip area excludes the horizontal axis padding.
            const labelX = Math.max(
              plot.x + scatterAxisPadding.left + 4,
              Math.min(
                x,
                plot.x +
                  plot.width -
                  scatterAxisPadding.right -
                  point.width -
                  4,
              ),
            );
            const labelY = Math.max(
              plot.y + 4,
              Math.min(y, plot.y + plot.height - 28),
            );
            const overlaps = [...placed, ...referenceLabels].filter(
              (other) =>
                labelX < other.labelX + other.width + 6 &&
                labelX + point.width + 6 > other.labelX &&
                labelY < other.labelY + other.height + 6 &&
                labelY + 30 > other.labelY,
            ).length;
            const coveredPoints = annotations.filter(
              (other) =>
                other.cx > labelX - 8 &&
                other.cx < labelX + point.width + 8 &&
                other.cy > labelY - 8 &&
                other.cy < labelY + 32,
            ).length;
            const distance = Math.hypot(
              point.cx -
                Math.max(labelX, Math.min(point.cx, labelX + point.width)),
              point.cy - Math.max(labelY, Math.min(point.cy, labelY + 24)),
            );
            return {
              labelX,
              labelY,
              score:
                overlaps * 100_000 +
                coveredPoints * 10_000 +
                (gap === 12 && position === 0 ? -1_000 : distance),
            };
          }),
      );
      const best = candidates.reduce((best, candidate) =>
        candidate.score < best.score ? candidate : best,
      );
      placed.push({ ...point, ...best, height: 24 });
    }
  }
  const renderPoint = ({ cx, cy, payload, isActive }: ScatterShapeProps) => {
    if (cx === undefined || cy === undefined) return null;
    const annotation = placed.find(({ model }) => model === payload.model);
    return (
      <MatchingModelsContext.Consumer>
        {(matchingModels) => {
          const matchesFilters = matchingModels.has(payload.model);
          const color = matchesFilters ? payload.color : '#94a3b8';
          return (
            <g
              className="scatter-model"
              data-model={payload.model}
              data-matches-filters={matchesFilters}
            >
              {annotation && (
                <line
                  x1={cx}
                  y1={cy}
                  x2={Math.max(
                    annotation.labelX,
                    Math.min(cx, annotation.labelX + annotation.width),
                  )}
                  y2={Math.max(
                    annotation.labelY,
                    Math.min(cy, annotation.labelY + 24),
                  )}
                  stroke="#94a3b8"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                  pointerEvents="none"
                />
              )}
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              <circle
                className="scatter-model-dot"
                cx={cx}
                cy={cy}
                r={isActive ? 6 : 4.5}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {annotation && (
                <g
                  className="scatter-model-label"
                  transform={`translate(${annotation.labelX}, ${annotation.labelY})`}
                >
                  <rect
                    y={1}
                    width={annotation.width}
                    height={22}
                    rx={11}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  <g
                    className="scatter-model-label-content"
                    transform="translate(6, 12)"
                  >
                    {annotation.icon && (
                      <>
                        <circle cx={7} cy={0} r={7} fill="#fff" />
                        <image
                          href={annotation.icon}
                          x={1}
                          y={-6}
                          width={12}
                          height={12}
                        />
                      </>
                    )}
                    <text
                      x={(annotation.icon ? 20 : 0) + annotation.textOffsetX}
                      y={annotation.textBaseline}
                      textAnchor="start"
                      dominantBaseline="alphabetic"
                      fill="#fff"
                      fontFamily="system-ui, sans-serif"
                      fontSize={11}
                      fontWeight={600}
                    >
                      {annotation.label}
                    </text>
                  </g>
                </g>
              )}
            </g>
          );
        }}
      </MatchingModelsContext.Consumer>
    );
  };
  return (
    <Scatter
      data={points}
      dataKey="axisValue"
      isAnimationActive={false}
      shape={renderPoint}
      activeShape={renderPoint}
    />
  );
});

// Keep one linear unit size outside explicitly marked empty intervals.
function createElapsedTimeAxis(values: number[], p50: number | null) {
  const anchors = [...new Set([...values, ...(p50 === null ? [] : [p50])])]
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const minimum = anchors[0] ?? 0;
  const maximum = anchors.at(-1) ?? 1;
  const span = maximum - minimum;
  const gaps = anchors.slice(1).map((value, index) => ({
    start: anchors[index],
    end: value,
    size: value - anchors[index],
  }));
  const sizes = gaps.map(({ size }) => size).sort((a, b) => a - b);
  const medianGap = sizes.length
    ? (sizes[Math.floor((sizes.length - 1) / 2)] +
        sizes[Math.floor(sizes.length / 2)]) /
      2
    : 0;
  const breaks =
    anchors.length < 4
      ? []
      : gaps
          .filter(({ size }) => size > Math.max(medianGap * 6, span * 0.08))
          .map(({ start, end, size }) => {
            const shoulder = Math.min(
              size * 0.1,
              Math.max(medianGap * 2, span * 0.005),
            );
            return { start: start + shoulder, end: end - shoulder };
          });
  const retainedSpan =
    span - breaks.reduce((total, gap) => total + gap.end - gap.start, 0);
  const breakWidth = retainedSpan * 0.035;
  const project = (value: number) =>
    value -
    breaks.reduce(
      (total, gap) =>
        total +
        Math.max(0, Math.min(1, (value - gap.start) / (gap.end - gap.start))) *
          (gap.end - gap.start - breakWidth),
      0,
    );
  const padding = Math.max(retainedSpan * 0.025, maximum * 0.005, 0.01);
  const upper = maximum + padding;
  const segments = [0, ...breaks.map(({ end }) => end)].map((start, index) => ({
    start,
    end: breaks[index]?.start ?? upper,
  }));
  const targetStep = Math.max(project(upper) / 8, 0.01);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step =
    ([1, 2, 5, 10].find((factor) => factor * magnitude >= targetStep) ?? 10) *
    magnitude;
  const ticks = segments
    .flatMap(({ start, end }) => {
      const first = Math.ceil(start / step) * step;
      const regular = Array.from(
        { length: Math.max(0, Math.floor((end - first) / step) + 1) },
        (_, index) => first + index * step,
      );
      // Small isolated clusters still need a tick identifying their original value.
      return regular.length
        ? regular
        : [
            anchors.find((value) => value >= start && value <= end) ??
              (start + end) / 2,
          ];
    })
    .map((value) => ({ value, position: project(value) }));
  return { breaks, project, ticks, domain: [0, project(upper)] };
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
                Axis break:{' '}
                {start.toLocaleString('en-US', { maximumFractionDigits: 2 })}–
                {end.toLocaleString('en-US', { maximumFractionDigits: 2 })} s
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

export function ModelPerformanceChart({
  models,
}: {
  models: {
    model: string;
    modelId: string;
    passRate: number;
    estimatedCostUsd: number | null;
    testcasesPerDollar: number | null;
    testcasesPerMinute: number | null;
    estimatedElapsedTimeSeconds: number | null;
    unavailableReason: string | null;
  }[];
}) {
  const [selectedModels, setSelectedModels] = useState<
    string[] | 'family-glory' | null
  >(null);
  const [selectedFamilies, setSelectedFamilies] = useState<string[] | null>(
    null,
  );
  const [budgetCases, setBudgetCases] = useState<number | null>(null);
  const budgetId = useId();
  const categorizedModels = useMemo(
    () =>
      models.map((model) => {
        const family =
          [model.model, model.modelId]
            .map(
              (name) =>
                Object.entries(modelFamilyNames).find(([prefix]) =>
                  name
                    .trim()
                    .toLowerCase()
                    .replace(/^.*\//, '')
                    .replace(/^openai_/, '')
                    .startsWith(prefix),
                )?.[1],
            )
            .find(Boolean) ?? 'Other';
        return {
          ...model,
          color: modelFamilyColors[family] ?? modelFamilyColors.Other,
          family,
        };
      }),
    [models],
  );
  const families = useMemo(
    () =>
      [...new Set(categorizedModels.map(({ family }) => family))].sort((a, b) =>
        a.localeCompare(b, 'en'),
      ),
    [categorizedModels],
  );
  const activeModels = useMemo(
    () =>
      selectedModels === 'family-glory'
        ? categorizedModels
            .filter(
              (model) =>
                Number.isFinite(model.passRate) &&
                !categorizedModels.some(
                  (other) =>
                    other.family === model.family &&
                    Number.isFinite(other.passRate) &&
                    (other.passRate - model.passRate ||
                      (other.testcasesPerMinute ?? Number.NEGATIVE_INFINITY) -
                        (model.testcasesPerMinute ??
                          Number.NEGATIVE_INFINITY) ||
                      (model.estimatedCostUsd ?? Number.POSITIVE_INFINITY) -
                        (other.estimatedCostUsd ?? Number.POSITIVE_INFINITY)) >
                      0,
                ),
            )
            .map(({ model }) => model)
        : selectedModels,
    [categorizedModels, selectedModels],
  );
  const [minimumCases, maximumCases] = (() => {
    const values = models.flatMap(({ testcasesPerDollar }) =>
      testcasesPerDollar !== null &&
      Number.isFinite(testcasesPerDollar) &&
      testcasesPerDollar > 0
        ? [testcasesPerDollar]
        : [],
    );
    return values.length
      ? [
          Math.floor(Math.min(...values) / 5) * 5,
          Math.ceil(Math.max(...values) / 1000) * 1000,
        ]
      : [0, 0];
  })();
  const budgetTarget = Math.max(
    minimumCases,
    Math.min(budgetCases ?? minimumCases, maximumCases),
  );
  const requiredCases = Math.round(budgetTarget);
  if (budgetCases !== null && budgetCases !== budgetTarget) {
    setBudgetCases(budgetTarget);
  }
  const budgetOffset = minimumCases === 0 ? 1 : 0;
  const budgetScale = {
    min: Math.log(minimumCases + budgetOffset),
    max: Math.log(maximumCases + budgetOffset),
    value: Math.log(budgetTarget + budgetOffset),
  };
  const matchingModels = useMemo(
    () =>
      new Set(
        categorizedModels
          .filter(
            ({ model, family, estimatedCostUsd }) =>
              estimatedCostUsd !== null &&
              Number.isFinite(estimatedCostUsd) &&
              estimatedCostUsd >= 0 &&
              requiredCases * estimatedCostUsd <= 1 &&
              (selectedFamilies === null ||
                selectedFamilies.includes(family)) &&
              (activeModels === null || activeModels.includes(model)),
          )
          .map(({ model }) => model),
      ),
    [categorizedModels, requiredCases, selectedFamilies, activeModels],
  );
  const dimensions = useMemo(
    () =>
      [
        { label: 'Pass Rate', key: 'passRate' as const, unit: '%' },
        {
          label: 'Affordability',
          key: 'testcasesPerDollar' as const,
          unit: 'cases / $1',
        },
        {
          label: 'Speed',
          key: 'testcasesPerMinute' as const,
          unit: 'cases / min',
        },
      ].map((dimension) => {
        const values = models
          .map((model) => model[dimension.key])
          .filter(
            (value): value is number =>
              value !== null &&
              Number.isFinite(value) &&
              (dimension.key === 'passRate'
                ? value >= 0 && value <= 1
                : value > 0),
          )
          .sort((a, b) => a - b);
        return {
          ...dimension,
          minimum: dimension.key === 'passRate' ? 0.6 : values[0],
          maximum: dimension.key === 'passRate' ? 1 : values.at(-1),
          p50: values.length
            ? (values[Math.floor((values.length - 1) / 2)] +
                values[Math.floor(values.length / 2)]) /
              2
            : null,
        };
      }),
    [models],
  );
  const hasReference = dimensions.every(({ p50 }) => p50 !== null);
  const elapsedTimes = useMemo(
    () =>
      models
        .map(({ estimatedElapsedTimeSeconds }) => estimatedElapsedTimeSeconds)
        .filter(
          (value): value is number =>
            value !== null && Number.isFinite(value) && value >= 0,
        )
        .sort((a, b) => a - b),
    [models],
  );
  const elapsedTimeP50 = elapsedTimes.length
    ? (elapsedTimes[Math.floor((elapsedTimes.length - 1) / 2)] +
        elapsedTimes[Math.floor(elapsedTimes.length / 2)]) /
      2
    : null;
  const passRateP50 = dimensions[0].p50;
  const passRateDomain = useMemo(() => {
    const values = models
      .map(({ passRate }) => passRate)
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
    if (!values.length) return [0, 100];
    const minimum = Math.floor(Math.min(...values) * 20) * 5;
    const maximum = Math.ceil(Math.max(...values) * 20) * 5;
    return minimum === maximum
      ? [Math.max(0, minimum - 5), Math.min(100, maximum + 5)]
      : [minimum, maximum];
  }, [models]);
  const axis = useMemo(
    () => createElapsedTimeAxis(elapsedTimes, elapsedTimeP50),
    [elapsedTimes, elapsedTimeP50],
  );
  const points = useMemo(
    () =>
      categorizedModels.flatMap((item) => {
        const value = item.estimatedElapsedTimeSeconds;
        return value !== null &&
          Number.isFinite(value) &&
          value >= 0 &&
          item.passRate >= 0 &&
          item.passRate <= 1
          ? [
              {
                model: item.model,
                modelId: item.modelId,
                value,
                axisValue: axis.project(value),
                passRate: item.passRate * 100,
                estimatedCostUsd: item.estimatedCostUsd,
                color: item.color,
              },
            ]
          : [];
      }),
    [categorizedModels, axis],
  );
  const legend = useMemo(
    () => (
      <ul className="model-performance-legend" aria-label="Models">
        {categorizedModels.map((model) => {
          const data = dimensions.map(
            ({ label, key, minimum, maximum, p50 }) => {
              const [value, reference] = [model[key], p50].map((value) =>
                value === null ||
                !Number.isFinite(value) ||
                maximum === undefined ||
                minimum === undefined ||
                (key !== 'passRate' && value <= 0)
                  ? null
                  : key === 'passRate'
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
            },
          );
          const available = data.every((dimension) => dimension.value !== null);
          return (
            <MatchingModelsContext.Consumer key={model.model}>
              {(matchingModels) => (
                <li>
                  <button
                    data-matches-filters={matchingModels.has(model.model)}
                    type="button"
                    className="performance-model-toggle"
                    aria-label={model.model}
                    aria-pressed={
                      activeModels === null ||
                      activeModels.includes(model.model)
                    }
                    title={[
                      model.model,
                      ...dimensions.map(
                        ({ label, key, unit }) =>
                          `${label}: ${model[key] === null ? 'Unavailable' : (key === 'passRate' ? model[key] * 100 : model[key]).toLocaleString('en-US', { maximumFractionDigits: key === 'passRate' ? 1 : 0 })} ${unit}`,
                      ),
                      ...(!available
                        ? [
                            model.unavailableReason ??
                              'Cost or speed estimate unavailable',
                          ]
                        : []),
                    ].join('\n')}
                    onClick={() =>
                      setSelectedModels(
                        activeModels === null
                          ? [model.model]
                          : activeModels.includes(model.model)
                            ? activeModels.filter(
                                (name) => name !== model.model,
                              )
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
                          data={data}
                          outerRadius="95%"
                          cy="60%"
                          margin={{ top: 12, right: 12, bottom: 4, left: 12 }}
                          accessibilityLayer={false}
                          role="img"
                          aria-label={`${model.model}: Pass Rate, Affordability and Speed. Pass Rate uses 60%–100%; Affordability and Speed use shared logarithmic ranges.`}
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
                          {available && (
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
          );
        })}
      </ul>
    ),
    [categorizedModels, dimensions, hasReference, activeModels],
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
              label: `P50: ${elapsedTimeP50.toLocaleString('en-US', { maximumFractionDigits: 2 })} s`,
            },
          ]),
      ...(passRateP50 === null
        ? []
        : [
            {
              axis: 'y' as const,
              value: passRateP50 * 100,
              label: `P50: ${(passRateP50 * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`,
            },
          ]),
    ];
    return (
      <div className="model-scatter-plot">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ScatterChart
            margin={{ top: 16, right: 24, bottom: 38, left: 16 }}
            accessibilityLayer
            aria-label={`Model Performance Overview: Estimated Model Duration Avg. in seconds on a linear horizontal axis with marked breaks across large empty intervals; Pass Rate from ${passRateDomain[0]}% to ${passRateDomain[1]}%`}
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
                (
                  axis.ticks.find(
                    (tick) => Math.abs(tick.position - position) < 1e-7,
                  )?.value ?? position
                ).toLocaleString('en-US', { maximumFractionDigits: 2 })
              }
              tickLine={false}
              axisLine={{ stroke: '#dce4ee' }}
              tickMargin={8}
              height={48}
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
              type="number"
              dataKey="passRate"
              domain={passRateDomain}
              allowDataOverflow
              ticks={Array.from(
                { length: (passRateDomain[1] - passRateDomain[0]) / 5 + 1 },
                (_, index) => passRateDomain[0] + index * 5,
              )}
              tick={{ fill: '#748195', fontSize: 11 }}
              tickFormatter={(value: number) => `${value}%`}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={64}
              label={{
                value: 'Pass Rate',
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
                stroke="#334155"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: label,
                  position: 'insideTopRight',
                  fill: '#334155',
                  fontSize: 11,
                  offset: 8,
                }}
              />
            ))}
            <ElapsedTimeAxisBreaks axis={axis} />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const point = active
                  ? points.find(
                      ({ model }) => model === payload?.[0]?.payload?.model,
                    )
                  : undefined;
                return point ? (
                  <div className="performance-tooltip">
                    <strong>{point.model}</strong>
                    <dl>
                      <div>
                        <dt>Pass Rate</dt>
                        <dd>
                          {point.passRate.toLocaleString('en-US', {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </dd>
                      </div>
                      <div>
                        <dt>Estimated Model Duration Avg.</dt>
                        <dd>
                          {point.value.toLocaleString('en-US', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          <span>s</span>
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
                  </div>
                ) : null;
              }}
            />
            <ModelScatter points={points} references={references} />
          </ScatterChart>
        </ResponsiveContainer>
        {!points.length && (
          <p className="performance-hidden-message">
            No model has a valid estimated model duration and pass rate.
          </p>
        )}
      </div>
    );
  }, [axis, passRateDomain, elapsedTimeP50, passRateP50, points]);

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
                  title="Select each family's best models by higher pass rate, then higher speed, then lower cost; exact ties are included"
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
