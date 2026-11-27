import { partition, sumBy } from 'es-toolkit';
import {
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ComponentType,
  type FocusEvent,
  Fragment,
  type MouseEvent,
  createContext,
  memo,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CartesianGrid,
  type LabelProps,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  XAxis,
  YAxis,
  ZIndexLayer,
  useChartHeight,
  useChartWidth,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';

import {
  type ModelBadge,
  type ReportChart,
  type ReportScatterPoint,
  formatEconomy,
} from '../../core/overview';
import highestAccuracyIcon from '../assets/accuracy.svg';
import highestBalanceIcon from '../assets/balance.svg';
import highestEconomyIcon from '../assets/economy.svg';
import fastestIcon from '../assets/performance.svg';
import { testcasePath } from '../types';
import '../scatter.css';
import { MetricHelp, performanceHelp } from './MetricHelp';

const modelBadges = {
  accuracy: { label: 'Highest accuracy', icon: highestAccuracyIcon },
  performance: { label: 'Fastest', icon: fastestIcon },
  economy: { label: 'Highest economy', icon: highestEconomyIcon },
  balance: {
    label: 'Highest balance',
    icon: highestBalanceIcon,
  },
};

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

type ScatterPoint = ReportScatterPoint & {
  axisValue: number;
  label: string;
  width: number;
  textOffsetX: number;
  textBaseline: number;
};

export const MatchingModelsContext = createContext<ReadonlySet<string>>(
  new Set(),
);
const activeLabelScale = 1.12;
const labelHeight = 22;
const labelGap = 14;
const badgeSize = 16;
const badgeCornerOffset = 1;
const badgeCenterY = -labelHeight / 2 + badgeCornerOffset;
const badgeLeftInset = badgeSize / 2 - badgeCornerOffset;
const scatterMargin = { top: 40, right: 30, bottom: 38, left: 16 };
const briefScale = 0.8;
const briefScatterMargin = {
  ...scatterMargin,
  bottom: scatterMargin.bottom - 5,
  left: scatterMargin.left - 4 / briefScale,
};
const scatterYAxisWidth = 64;

function createPerformanceAxis(
  points: Pick<ScatterPoint, 'performance' | 'width' | 'badges'>[],
  plotWidth: number,
) {
  const anchors = [
    ...new Set(points.map(({ performance }) => performance)),
  ].sort((a, b) => a - b);
  const minimum = anchors[0] ?? 0;
  const maximum = anchors.at(-1) ?? minimum;
  const foldFrom = anchors.filter((value) => value < 3).at(-1) ?? minimum;
  const breaks = anchors.slice(1).flatMap((end, index) => {
    const start = anchors[index];
    // Converting to seconds can round an exact threshold gap down.
    return start >= foldFrom && end - start >= 0.64 - Number.EPSILON * end
      ? [{ start, end }]
      : [];
  });
  const intervals = breaks.flatMap((gap, index) => [
    { start: breaks[index - 1]?.end ?? minimum, end: gap.start, folded: false },
    { ...gap, folded: true },
  ]);
  intervals.push({
    start: breaks.at(-1)?.end ?? minimum,
    end: maximum,
    folded: false,
  });
  const retainedSpan = sumBy(intervals, (interval) =>
    interval.folded ? 0 : interval.end - interval.start,
  );
  const largestGap = Math.max(
    0,
    ...breaks.map(({ start, end }) => end - start),
  );
  const foldedWeight = sumBy(
    breaks,
    ({ start, end }) => (end - start) / largestGap,
  );
  const minFoldWidth = 45;
  const minDataWidth = Math.max(
    32,
    breaks.length * minFoldWidth + (retainedSpan ? 32 : 0),
  );
  const projectAt = (width: number) => {
    // Reserve every fold's minimum before distributing extra width.
    const maxFoldWidth = foldedWeight
      ? Math.min(65, minFoldWidth + (width - minDataWidth) / foldedWeight)
      : 0;
    const foldWidth = (size: number) =>
      Math.max(minFoldWidth, (size / largestGap) * maxFoldWidth);
    const retainedWidth = Math.max(
      0,
      width - sumBy(breaks, ({ start, end }) => foldWidth(end - start)),
    );
    let position = retainedSpan ? 0 : retainedWidth / 2;
    const pieces = intervals.map((interval) => {
      const size = interval.end - interval.start;
      const pieceWidth = interval.folded
        ? foldWidth(size)
        : retainedSpan
          ? (size / retainedSpan) * retainedWidth
          : 0;
      const piece = { ...interval, position, width: pieceWidth };
      position += pieceWidth;
      return piece;
    });
    return (value: number) => {
      const piece = pieces.find(({ end }) => value <= end) ?? pieces.at(-1)!;
      return Math.min(
        width,
        piece.position +
          (piece.end === piece.start
            ? 0
            : ((value - piece.start) / (piece.end - piece.start)) *
              piece.width),
      );
    };
  };
  const capsulePadding = (
    project: (value: number) => number,
    width: number,
  ) => {
    let left = 0;
    let right = 0;
    for (const point of points) {
      const x = project(point.performance);
      const halfWidth = (point.width * activeLabelScale) / 2 + 2;
      left = Math.max(
        left,
        Math.ceil(
          halfWidth +
            (point.badges.length ? badgeLeftInset * activeLabelScale : 0) -
            x,
        ),
      );
      right = Math.max(right, Math.ceil(x + halfWidth - width));
    }
    return { left, right };
  };
  const minimumPadding = capsulePadding(projectAt(minDataWidth), minDataWidth);
  const minPlotWidth =
    minDataWidth + minimumPadding.left + minimumPadding.right;
  const available = Math.max(minPlotWidth, plotWidth);
  const padding = { left: 0, right: 0 };
  let width = available;
  let project = projectAt(width);
  // Each added pixel of padding reduces the space between capsule centers.
  // Reproject until neither side needs any more room.
  for (;;) {
    const needed = capsulePadding(project, width);
    if (needed.left <= padding.left && needed.right <= padding.right) break;
    padding.left = Math.max(padding.left, needed.left);
    padding.right = Math.max(padding.right, needed.right);
    width = available - padding.left - padding.right;
    project = projectAt(width);
  }
  const domain = [0, width];
  const targetStep = Math.max(
    (retainedSpan || maximum - minimum || 1) / 8,
    Number.MIN_VALUE,
  );
  const magnitude =
    10 ** Math.floor(Math.log10(targetStep)) || Number.MIN_VALUE;
  const step =
    ([1, 2, 5, 10].find((factor) => factor * magnitude >= targetStep) ?? 10) *
    magnitude;
  const candidates = [
    ...new Set([
      ...anchors.slice(0, 1),
      ...anchors.slice(-1),
      ...intervals
        .filter((interval) => !interval.folded)
        .flatMap(({ start, end }) => {
          const first = Math.ceil(start / step) * step;
          const count = Math.min(
            10,
            Math.max(0, Math.floor((end - first) / step) + 1),
          );
          const regular = Array.from(
            { length: count },
            (_, i) => first + i * step,
          ).filter((value) => value >= start && value <= end);
          return regular.length
            ? regular
            : [
                anchors.find((value) => value >= start && value <= end) ??
                  start + (end - start) / 2,
              ];
        })
        .filter((value) => Number.isFinite(value) && value >= 0),
    ]),
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
              const target = (width * i) / 8;
              return candidates.reduce((best, tick) =>
                Math.abs(tick.position - target) <
                Math.abs(best.position - target)
                  ? tick
                  : best,
              );
            }),
          ),
        ];
  const tickMagnitude = Math.log10(step);
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
    breaks,
    project,
    ticks,
    domain,
    formatTick,
    padding,
    minPlotWidth,
  };
}

function PerformanceAxisBreaks({
  axis,
}: { axis: ReturnType<typeof createPerformanceAxis> }) {
  const plot = usePlotArea();
  const scale = useXAxisScale();
  if (!plot || !scale) return null;
  const [axisStart, axisEnd] = axis.domain;
  const leftEdge = scale(axisStart);
  const rightEdge = scale(axisEnd);
  // Wait for Recharts to apply the new pixel scale after a resize.
  if (
    leftEdge === undefined ||
    rightEdge === undefined ||
    Math.abs(rightEdge - leftEdge - (axisEnd - axisStart)) > 0.01
  )
    return null;
  return (
    <ZIndexLayer zIndex={550}>
      <g className="performance-axis-breaks" pointerEvents="none">
        {axis.breaks.map(({ start, end }) => {
          const left = scale(axis.project(start));
          const right = scale(axis.project(end));
          if (left === undefined || right === undefined) return null;
          const center = (left + right) / 2;
          const markScale = Math.min(1, (right - left) / 18);
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
                  d="M -7 5 l 6 -10 M 1 5 l 6 -10"
                  transform={`translate(${center} ${y}) scale(${markScale} 1)`}
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

export type ScatterLinkProps = ComponentPropsWithoutRef<'a'> & { href: string };

type PlottedMarker = { point: ScatterPoint; x: number; y: number; id: string };

const ModelScatterLayer = memo(function ModelScatterLayer({
  points,
  container,
  formatPerformance,
  firstTestcase,
  onOpenTestcase,
  LinkComponent,
}: {
  points: ScatterPoint[];
  container: { readonly current: HTMLDivElement | null };
  formatPerformance: (value: number) => string;
  firstTestcase?: string;
  onOpenTestcase?: () => void;
  LinkComponent: ComponentType<ScatterLinkProps>;
}) {
  const matchingModels = useContext(MatchingModelsContext);
  const chartWidth = useChartWidth();
  const chartHeight = useChartHeight();
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const markId = useId();
  const [hover, setHover] = useState<{
    model: string;
    onLabel: boolean;
  } | null>(null);
  const [focusedModel, setFocusedModel] = useState<string | null>(null);

  const hoveredModel = hover && matchingModels.has(hover.model) ? hover : null;
  const activeModel = hoveredModel?.model ?? focusedModel;
  const plotted = useMemo(
    () =>
      points.flatMap<PlottedMarker>((point, index) => {
        const x = xScale?.(point.axisValue);
        const y = yScale?.(point.accuracy);
        return x === undefined || y === undefined
          ? []
          : [{ point, x, y, id: `${markId}-${index}` }];
      }),
    [points, xScale, yScale, markId],
  );
  const paintOrder = useMemo(() => {
    const [matching, dimmed] = partition(plotted, ({ point }) =>
      matchingModels.has(point.model),
    );
    return [...dimmed, ...matching];
  }, [plotted, matchingModels]);
  const active = plotted.find(
    ({ point }) =>
      point.model === activeModel && matchingModels.has(point.model),
  );
  const portal = container.current;
  const tooltipStyle = (() => {
    if (!active || chartWidth === undefined || chartHeight === undefined)
      return null;
    const { point, x, y } = active;
    const openLeft = x > chartWidth / 2;
    const offset = hoveredModel?.onLabel
      ? (point.width / 2 +
          (openLeft && point.badges.length ? badgeLeftInset : 0)) *
          activeLabelScale +
        4
      : 10;
    const anchorY =
      y + (hoveredModel?.onLabel ? labelGap + labelHeight / 2 : 0);
    const left = openLeft ? `calc(${x - offset}px - 100%)` : `${x + offset}px`;
    return {
      width: Math.min(250, chartWidth - 16),
      transform: `translate(clamp(8px, ${left}, calc(${chartWidth - 8}px - 100%)), clamp(8px, calc(${anchorY}px - 50%), calc(${chartHeight - 8}px - 100%)))`,
    };
  })();
  const coincident = active
    ? points.filter(
        ({ performance, accuracy }) =>
          performance === active.point.performance &&
          accuracy === active.point.accuracy,
      )
    : [];
  const tooltipBadge = (badge: ModelBadge) =>
    active?.point.badges.includes(badge) && (
      <img
        data-badge={badge}
        src={modelBadges[badge].icon}
        alt={modelBadges[badge].label}
        width={badgeSize}
        height={badgeSize}
      />
    );

  return (
    <>
      <ZIndexLayer zIndex={1201}>
        {active && plot && (
          <path
            d={`M ${plot.x} ${active.y} H ${plot.x + plot.width} M ${active.x} ${plot.y} V ${plot.y + plot.height}`}
            fill="none"
            stroke="#94a3b8"
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        )}
        <g
          onPointerOver={(event) => {
            if (
              event.pointerType === 'touch' ||
              !(event.target instanceof Element)
            )
              return;
            const model = event.target
              .closest('[data-model]')
              ?.getAttribute('data-model');
            if (!model || !matchingModels.has(model)) return;
            const onLabel = event.target.hasAttribute('data-label-hit-area');
            if (hover?.model !== model || hover.onLabel !== onLabel) {
              setHover({ model, onLabel });
              if (focusedModel) setFocusedModel(null);
            }
          }}
          onPointerOut={(event) => {
            const next = event.relatedTarget;
            if (!(next instanceof Node) || !event.currentTarget.contains(next))
              setHover(null);
          }}
          onPointerDown={() => setFocusedModel(null)}
          onPointerCancel={() => setHover(null)}
        >
          {paintOrder.map(({ point, x, y, id }) => {
            const matchesFilters = matchingModels.has(point.model);
            const isActive = active?.point === point;
            const isHovered = hoveredModel?.model === point.model;
            const color = matchesFilters ? point.color : '#94a3b8';
            const radius = isActive ? 6 : 4.5;
            const labelTop = y + labelGap;
            const labelLeft = -point.width / 2;
            // Extend the connector into the capsule so it stays attached as it scales.
            const labelCenter = labelTop + labelHeight / 2;
            const badge = point.badges[0];
            const badgeCenterX = labelLeft + badgeCornerOffset;
            const path = testcasePath(firstTestcase, point.model);
            const linkProps = {
              className: 'scatter-model-link',
              'data-model': point.model,
              'data-matches-filters': matchesFilters,
              'aria-label': `View details for ${point.model}`,
              'aria-disabled': matchesFilters ? undefined : true,
              tabIndex: matchesFilters ? 0 : -1,
              onFocus: (event: FocusEvent<Element>) => {
                if (event.currentTarget.matches(':focus-visible'))
                  setFocusedModel(point.model);
              },
              onBlur: () => setFocusedModel(null),
              onClick: (event: MouseEvent<Element>) => {
                if (matchesFilters) onOpenTestcase?.();
                else event.preventDefault();
              },
            };
            const marker = (
              <Fragment key={point.model}>
                <circle cx={x} cy={y} r={12} fill="transparent" />
                <line
                  x1={x}
                  x2={x}
                  y1={y}
                  y2={labelCenter}
                  stroke="transparent"
                  strokeWidth={10}
                />
                <rect
                  data-label-hit-area=""
                  x={x + labelLeft}
                  y={labelTop}
                  width={point.width}
                  height={labelHeight}
                  rx={labelHeight / 2}
                  fill="transparent"
                />
                {badge && (
                  <circle
                    data-label-hit-area=""
                    cx={x + badgeCenterX}
                    cy={labelCenter + badgeCenterY}
                    r={badgeSize / 2}
                    fill="transparent"
                  />
                )}
                <g opacity={isHovered ? 0 : undefined} pointerEvents="none">
                  <g id={id}>
                    <line
                      className="scatter-model-connector"
                      x1={x}
                      x2={x}
                      y1={y + radius}
                      y2={labelCenter}
                      stroke={color}
                      strokeWidth={isActive ? 2.4 : 1.4}
                    />
                    <circle
                      className="scatter-model-dot"
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    <g
                      className="scatter-model-label"
                      transform={`translate(${x}, ${labelCenter})`}
                    >
                      <g
                        className="scatter-model-label-inner"
                        data-active={isActive}
                      >
                        <rect
                          x={labelLeft}
                          y={-labelHeight / 2}
                          width={point.width}
                          height={labelHeight}
                          rx={labelHeight / 2}
                          fill={color}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                        {point.icon && (
                          <>
                            <circle cx={labelLeft + 13} r={7} fill="#fff" />
                            <image
                              href={point.icon}
                              x={labelLeft + 7}
                              y={-6}
                              width={12}
                              height={12}
                            />
                          </>
                        )}
                        <text
                          x={
                            labelLeft +
                            (point.icon ? 26 : 6) +
                            point.textOffsetX
                          }
                          y={point.textBaseline}
                          fill="#fff"
                          fontFamily="system-ui, sans-serif"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {point.label}
                        </text>
                        {badge && (
                          <image
                            className="scatter-model-badge"
                            data-badge={badge}
                            href={modelBadges[badge].icon}
                            x={badgeCenterX - badgeSize / 2}
                            y={badgeCenterY - badgeSize / 2}
                            width={badgeSize}
                            height={badgeSize}
                          />
                        )}
                      </g>
                    </g>
                  </g>
                </g>
              </Fragment>
            );
            return (
              <LinkComponent key={point.model} {...linkProps} href={path}>
                {marker}
              </LinkComponent>
            );
          })}
          {/* Raise the visual marks without moving the interactive SVG links. */}
          {hoveredModel && active && (
            <use
              className="scatter-hovered-mark"
              href={`#${active.id}`}
              pointerEvents="none"
            />
          )}
        </g>
      </ZIndexLayer>
      {active &&
        portal &&
        tooltipStyle &&
        createPortal(
          <div className="performance-tooltip" style={tooltipStyle}>
            <strong>{active.point.model}</strong>
            <dl>
              <div>
                <dt>
                  Accuracy
                  {tooltipBadge('accuracy')}
                </dt>
                <dd>
                  {active.point.accuracy.toLocaleString('en-US', {
                    maximumFractionDigits: 1,
                  })}
                  %
                </dd>
              </div>
              <div>
                <dt>
                  Performance
                  {tooltipBadge('performance')}
                </dt>
                <dd>
                  {formatPerformance(active.point.performance)} <span>s</span>
                </dd>
              </div>
              <div>
                <dt>
                  Economy
                  {tooltipBadge('economy')}
                </dt>
                <dd>{formatEconomy(active.point.economy)}</dd>
              </div>
              <div>
                <dt>
                  Balance
                  {tooltipBadge('balance')}
                </dt>
                <dd>{active.point.balance?.toFixed(1) ?? 'Unavailable'}</dd>
              </div>
            </dl>
            {coincident.length > 1 && (
              <p>
                Models at this position:{' '}
                {coincident.map(({ model }) => model).join(', ')}
              </p>
            )}
          </div>,
          portal,
        )}
    </>
  );
});

export type ScatterViewport = { width: number; height: number };

export const ScatterPlot = memo(function ScatterPlot({
  scatter: {
    points: reportPoints,
    accuracyP50,
    performanceP50,
    accuracyDomain,
  },
  firstTestcase,
  onOpenTestcase,
  LinkComponent,
  viewport,
}: {
  scatter: ReportChart['scatter'];
  firstTestcase?: string;
  onOpenTestcase?: () => void;
  LinkComponent: ComponentType<ScatterLinkProps>;
  viewport?: ScatterViewport;
}) {
  const scatterContainer = useRef<HTMLDivElement | null>(null);
  const [scatterWidth, setScatterWidth] = useState(0);
  const fitToViewport = viewport !== undefined;
  useLayoutEffect(() => {
    if (fitToViewport) return;
    // Recharts measures its first size before the resize callback fires.
    const width = scatterContainer.current?.getBoundingClientRect().width;
    if (width !== undefined) setScatterWidth(Math.round(width));
  }, [fitToViewport]);
  const plotted = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context) context.font = '600 11px system-ui, sans-serif';
    return reportPoints.map((point) => ({
      ...point,
      ...measureScatterLabel(point.model, point.icon, context),
    }));
  }, [reportPoints]);

  const margin = fitToViewport ? briefScatterMargin : scatterMargin;
  const reservedWidth = margin.left + scatterYAxisWidth + margin.right;
  const availableWidth = viewport ? viewport.width / briefScale : scatterWidth;
  const axis = createPerformanceAxis(plotted, availableWidth - reservedWidth);
  const minWidth = reservedWidth + axis.minPlotWidth;
  const scale = viewport ? Math.min(briefScale, viewport.width / minWidth) : 1;
  // Give the chart enough layout space to fill the brief after scaling.
  const fixedSize = viewport && {
    width: Math.max(availableWidth, minWidth),
    height: viewport.height / scale,
  };
  const style: CSSProperties & { '--brief-chart-scale'?: number } = fixedSize
    ? {
        ...fixedSize,
        '--brief-chart-scale': scale,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }
    : { minWidth };
  const points = plotted.map((point) => ({
    ...point,
    axisValue: axis.project(point.performance),
  }));
  const references = [
    ...(performanceP50 === null
      ? []
      : [
          {
            axis: 'x' as const,
            value: axis.project(performanceP50),
            label: `P50: ${axis.formatTick(performanceP50)} s`,
          },
        ]),
    ...(accuracyP50 === null
      ? []
      : [
          {
            axis: 'y' as const,
            value: accuracyP50,
            label: `P50: ${accuracyP50.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`,
          },
        ]),
  ];
  return (
    <div
      className="model-scatter-plot"
      ref={scatterContainer}
      // The markers handle their own hover. Skip Recharts' mousemove work.
      onMouseMoveCapture={(event) => event.stopPropagation()}
      style={style}
    >
      <ResponsiveContainer
        width={fixedSize?.width ?? '100%'}
        height={fixedSize?.height ?? '100%'}
        minWidth={0}
        onResize={
          fitToViewport
            ? undefined
            : (width) => setScatterWidth(Math.round(width))
        }
      >
        <ScatterChart
          data={points}
          margin={margin}
          accessibilityLayer
          aria-label={`Model Performance Overview: Performance in seconds${axis.breaks.length ? ' with breaks across large empty intervals' : ''}, and Accuracy from ${accuracyDomain[0]}% to ${accuracyDomain[1]}%.`}
        >
          <CartesianGrid stroke="#e8edf4" strokeDasharray="3 5" />
          <XAxis
            type="number"
            dataKey="axisValue"
            scale="linear"
            domain={axis.domain}
            allowDataOverflow
            padding={axis.padding}
            ticks={axis.ticks.map(({ position }) => position)}
            interval="preserveStartEnd"
            tick={{ fill: '#748195', fontSize: 11, pointerEvents: 'none' }}
            tickFormatter={(position: number) =>
              axis.formatTick(
                axis.ticks.find((tick) => tick.position === position)?.value ??
                  position,
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
                const directionY = Number(y) - (viewBox.width < 340 ? 18 : 0);
                return (
                  <g
                    className="performance-axis-labels"
                    fill="#526176"
                    fontSize={11}
                  >
                    <text x={viewBox.x} y={directionY} textAnchor="start">
                      ← Faster
                    </text>
                    <foreignObject
                      x={viewBox.x}
                      y={Number(y) - 14}
                      width={viewBox.width}
                      height={22}
                      overflow="visible"
                    >
                      <div className="performance-axis-title">
                        Performance (s)
                        <MetricHelp
                          label="Performance"
                          text={performanceHelp}
                        />
                      </div>
                    </foreignObject>
                    <text
                      x={viewBox.x + viewBox.width}
                      y={directionY}
                      textAnchor="end"
                    >
                      Slower →
                    </text>
                  </g>
                );
              },
            }}
          />
          <YAxis
            orientation="left"
            type="number"
            dataKey="accuracy"
            scale="linear"
            domain={accuracyDomain}
            allowDataOverflow
            ticks={(() => {
              const [minimum, maximum] = accuracyDomain;
              const step = maximum - minimum <= 10 ? 1 : 5;
              const first = Math.ceil((minimum + step / 2) / step) * step;
              return [
                minimum,
                ...Array.from(
                  { length: Math.floor((maximum - first) / step) + 1 },
                  (_, index) => first + index * step,
                ),
              ];
            })()}
            interval="preserveStartEnd"
            tick={{ fill: '#748195', fontSize: 11 }}
            tickFormatter={(value: number) => value.toLocaleString('en-US')}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={scatterYAxisWidth}
            label={{
              content: ({ viewBox }: LabelProps) => {
                if (!viewBox || !('x' in viewBox)) return null;
                const centerY = viewBox.y + viewBox.height / 2;
                return (
                  <foreignObject
                    x={-viewBox.height / 2}
                    y={-10}
                    width={viewBox.height}
                    height={20}
                    transform={`translate(${viewBox.x + 10} ${centerY}) rotate(-90)`}
                    overflow="visible"
                  >
                    <div className="accuracy-axis-title">
                      Accuracy (%)
                      <MetricHelp
                        label="Accuracy"
                        includeAverageNote={false}
                        text={
                          <span>
                            Accuracy is the percentage of test cases the model
                            answers correctly. It reflects how reliably the
                            model locates the target UI element or determines
                            that no matching element is present.
                          </span>
                        }
                      />
                    </div>
                  </foreignObject>
                );
              },
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
                fill: '#334155',
                fontSize: 11,
                ...(axis === 'x'
                  ? { position: 'top', offset: 9 }
                  : {
                      className: 'accuracy-reference-label',
                      position: 'right',
                      offset: margin.right / 2,
                      angle: -90,
                      textAnchor: 'middle',
                      pointerEvents: 'none',
                    }),
              }}
            />
          ))}
          <PerformanceAxisBreaks axis={axis} />
          <ModelScatterLayer
            points={points}
            container={scatterContainer}
            formatPerformance={axis.formatTick}
            firstTestcase={firstTestcase}
            onOpenTestcase={onOpenTestcase}
            LinkComponent={LinkComponent}
          />
        </ScatterChart>
      </ResponsiveContainer>
      {!points.length && (
        <p className="performance-hidden-message">
          No model has both performance and accuracy data.
        </p>
      )}
    </div>
  );
});
