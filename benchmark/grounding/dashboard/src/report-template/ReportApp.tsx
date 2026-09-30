import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CssBaseline,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material';
import { type MouseEvent, useMemo, useState } from 'react';
import type { BBox, ErrorDetail } from '../../../evaluation/task-types.js';
import {
  CaseNameCell,
  ERROR_CELL_COLORS,
  ErrorDebugDisclosure,
  caseTagLabel,
  extractHttpStatusCode,
  getRateCellColors,
  getSuccessfulCenter,
  imageTypeLabel,
} from '../shared/task-detail/common';
import { CategorySummary } from './category-summary';
import {
  CASE_CATEGORIES,
  getCaseClassification,
} from './category-summary-data';
import { MODEL_LOGO_URLS, normalizeModelLogoPath } from './logo-manifest';
import type { ReportData } from './report-types';
import { ReportColorLegendSection, ToggleSection } from './sections';

type CellDetailImageOption = {
  promptType: 'primary' | 'fallback';
  imageName: string;
  imageType: 'sd' | 'hd';
};

type CellDetailInfo = {
  modelId: string;
  modelAlias: string;
  caseName: string;
  promptType: 'primary' | 'fallback';
  imageName: string;
  imageType: 'sd' | 'hd';
  imageOptions?: CellDetailImageOption[];
};

type ModelDiffTableRow = {
  key: string;
  caseName: string;
  promptType: 'primary' | 'fallback';
  imageName: string;
  imageType: 'sd' | 'hd';
  displayName: string;
};

type ModelDiffTableCell = {
  accuracy: number;
  hasError: boolean;
  total: number;
  correct: number;
  noData: boolean;
  pending: number;
};

type ModelDiffTableData = {
  columns: Array<{ modelId: string; modelAlias: string }>;
  rows: ModelDiffTableRow[];
  cells: Map<string, Map<string, ModelDiffTableCell>>;
};

type CaseImageMeta = {
  gtBox: [number, number, number, number] | null;
  expectedOutcome?: 'point' | 'refusal';
  imageRelativePath: string;
  imageWidth: number | null;
  imageHeight: number | null;
  caseTags: string[];
};

const theme = createTheme({
  palette: {
    background: {
      default: '#f5f6fb',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
  },
});

const IMAGE_DISPLAY_MAX_WIDTH = 900;

function statusLabel(status: string): string {
  return (
    {
      pending: '待执行',
      running: '执行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已停止',
    }[status] ?? status
  );
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString('zh-CN');
}

function formatRequestDuration(durationMs: number | null | undefined): string {
  if (
    typeof durationMs !== 'number' ||
    Number.isNaN(durationMs) ||
    durationMs < 0
  ) {
    return '—';
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatPercent(
  value: number | null | undefined,
  options: { avoidRoundedHundred?: boolean } = {},
): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  if (options.avoidRoundedHundred && value > 0 && value < 1) {
    const percent = value * 100;
    if (percent >= 99.5) {
      return `${percent.toFixed(1)}%`;
    }
  }
  return `${(value * 100).toFixed(0)}%`;
}

function durationCellColors(
  durationMs: number,
  maxDurationMs: number,
): { backgroundColor: string; color: string } {
  if (!durationMs || !maxDurationMs) {
    return { backgroundColor: '#f5f5f5', color: '#616161' };
  }
  const ratio = Math.min(1, Math.max(0, durationMs / maxDurationMs));
  const alpha = 0.12 + ratio * 0.5;
  return {
    backgroundColor: `rgba(25, 118, 210, ${alpha.toFixed(2)})`,
    color: ratio > 0.62 ? '#fff' : '#0d47a1',
  };
}

function rowBaseBackground(rowIndex: number): string {
  return rowIndex % 2 === 0 ? '#f7f9fc' : '#fff';
}

function layerRowTint(baseColor: string, rowIndex: number): string {
  if (rowIndex % 2 === 0) {
    return `linear-gradient(rgba(15, 23, 42, 0.045), rgba(15, 23, 42, 0.045)), ${baseColor}`;
  }
  return baseColor;
}

function makeImageKey(
  caseName: string,
  imageName: string,
  imageType: 'sd' | 'hd',
): string {
  return `${caseName}|${imageName}|${imageType}`;
}

function buildModelDiffTableData(
  detail: ReportData['task'],
  imageMetaMap: Map<string, CaseImageMeta>,
  scoringMode: 'legacy' | 'answer',
): ModelDiffTableData | null {
  if (!detail.results || detail.results.length === 0) return null;

  const results = detail.results;
  const columns = results
    .map((m) => ({
      modelId: m.modelId,
      modelAlias: m.modelAlias,
    }))
    .sort((a, b) => a.modelAlias.localeCompare(b.modelAlias));

  const caseImageCounts = new Map<string, Map<string, number>>();
  for (const model of results) {
    for (const c of model.cases) {
      const caseKey = `${c.caseName}|${c.promptType}`;
      if (!caseImageCounts.has(caseKey)) {
        const typeCount = new Map<string, number>();
        for (const img of c.images) {
          typeCount.set(img.imageType, (typeCount.get(img.imageType) ?? 0) + 1);
        }
        caseImageCounts.set(caseKey, typeCount);
      }
    }
  }

  const rowMap = new Map<string, ModelDiffTableRow>();

  for (const model of results) {
    for (const c of model.cases) {
      for (const img of c.images) {
        const key = `${c.caseName}|${c.promptType}|${img.imageName}|${img.imageType}`;
        if (!rowMap.has(key)) {
          const caseKey = `${c.caseName}|${c.promptType}`;
          const typeCount = caseImageCounts.get(caseKey);
          const hd = typeCount?.get('hd') ?? 0;
          const sd = typeCount?.get('sd') ?? 0;
          const isMulti = hd > 1 || sd > 1;
          const displayName = isMulti
            ? `${c.caseName}-${img.imageName}`
            : c.caseName;
          rowMap.set(key, {
            key,
            caseName: c.caseName,
            promptType: c.promptType,
            imageName: img.imageName,
            imageType: img.imageType,
            displayName,
          });
        }
      }
    }
  }

  const rows = Array.from(rowMap.values()).sort((a, b) => {
    if (a.caseName !== b.caseName) return a.caseName.localeCompare(b.caseName);
    if (a.promptType !== b.promptType) {
      return a.promptType.localeCompare(b.promptType);
    }
    return a.imageName.localeCompare(b.imageName);
  });

  const cells = new Map<string, Map<string, ModelDiffTableCell>>();
  for (const model of results) {
    for (const c of model.cases) {
      for (const img of c.images) {
        const rowKey = `${c.caseName}|${c.promptType}|${img.imageName}|${img.imageType}`;
        const meta = imageMetaMap.get(
          makeImageKey(c.caseName, img.imageName, img.imageType),
        );
        const gtBox = meta?.gtBox ?? null;
        let total = 0;
        let correct = 0;
        let hasError = false;
        let noData = false;

        for (const req of img.requests) {
          if (scoringMode === 'answer') {
            total++;
            if (
              !req.error &&
              req.locate.success &&
              (req.locate.answerCorrect === true ||
                (req.locate.answerCorrect == null &&
                  req.locate.expectedOutcome !== 'refusal' &&
                  req.locate.hitGt))
            ) {
              correct++;
            }
            if (req.error || !req.locate.success) {
              hasError = true;
            }
            continue;
          }

          if (req.error) {
            hasError = true;
            continue;
          }

          const outcome = getSuccessfulCenter(req);
          if (!outcome.success) {
            hasError = true;
            continue;
          }

          total++;
          const center = outcome.center;
          if (
            center &&
            gtBox &&
            center.x >= gtBox[0] &&
            center.x <= gtBox[2] &&
            center.y >= gtBox[1] &&
            center.y <= gtBox[3]
          ) {
            correct++;
          }
        }

        const pending = Math.max(
          0,
          detail.params.iterations - img.requests.length,
        );
        if (scoringMode === 'answer') {
          noData = img.requests.length === 0;
          total = detail.params.iterations;
        } else if (total === 0) {
          noData = true;
        }

        const accuracy = total > 0 ? correct / total : 0;
        if (!cells.has(rowKey)) {
          cells.set(rowKey, new Map());
        }
        cells.get(rowKey)!.set(model.modelId, {
          accuracy,
          hasError,
          total,
          correct,
          noData,
          pending,
        });
      }
    }
  }

  return { columns, rows, cells };
}

function getCaseTags(
  caseCatalog: ReportData['caseCatalog'],
  caseName: string,
): string[] {
  return caseCatalog.find((item) => item.caseName === caseName)?.tags ?? [];
}

function buildCaseSummaryOptions(
  detail: ReportData['task'],
  caseName: string,
  promptType: 'primary' | 'fallback',
): CellDetailImageOption[] {
  const options = new Map<string, CellDetailImageOption>();
  for (const model of detail.results ?? []) {
    const caseResult = model.cases.find(
      (item) => item.caseName === caseName && item.promptType === promptType,
    );
    for (const image of caseResult?.images ?? []) {
      const key = `${promptType}|${image.imageName}|${image.imageType}`;
      if (!options.has(key)) {
        options.set(key, {
          promptType,
          imageName: image.imageName,
          imageType: image.imageType,
        });
      }
    }
  }
  return Array.from(options.values());
}

const SCATTER_LOGO_SIZE = 10.8;
const SCATTER_BADGE_HEIGHT = 7;
const SCATTER_BADGE_FONT_SIZE = 4.8;
const SCATTER_BADGE_OFFSET_X = -1.2;
const SCATTER_BADGE_OFFSET_Y = 0;
const SCATTER_BADGE_MIN_WIDTH = 8;
const SCATTER_BADGE_CHAR_WIDTH = 3.9;
const SCATTER_BADGE_COLOR = '#c2185b';

function modelBadgeText(
  shortName?: string,
  modelAlias?: string,
): string | null {
  if (shortName?.trim()) return shortName.trim();
  if (modelAlias?.trim()) return modelAlias.trim();
  return null;
}

function getModelLogoSrc(logo?: string, logoDataUri?: string): string | null {
  const logoPath = normalizeModelLogoPath(logo);
  return MODEL_LOGO_URLS[logoPath] || logoDataUri || null;
}

function ModelPerformanceScatter({
  summaries,
  scoreLabel,
}: {
  summaries: ReportData['modelSummaries'];
  scoreLabel: string;
}) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    rows: string[];
  } | null>(null);
  const points = summaries.filter(
    (item) =>
      typeof item.hitRate === 'number' &&
      item.requestSuccessCount > 0 &&
      item.p50DurationMs > 0,
  );

  if (points.length === 0) {
    return null;
  }

  const width = 920;
  const height = 330;
  const padding = { left: 64, right: 28, top: 14, bottom: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const yMinRate = scoreLabel === '答对率' ? 0 : 0.5;
  const maxDuration = Math.max(...points.map((item) => item.p50DurationMs));
  const xMax = Math.max(1000, maxDuration * 1.12);
  const avgHitRate =
    points.reduce((sum, item) => sum + (item.hitRate ?? 0), 0) / points.length;
  const medianP50 = [...points]
    .map((item) => item.p50DurationMs)
    .sort((a, b) => a - b)[Math.floor((points.length - 1) / 2)];

  const x = (durationMs: number) =>
    padding.left + (durationMs / xMax) * plotWidth;
  const y = (hitRate: number) =>
    padding.top +
    (1 - (Math.max(yMinRate, hitRate) - yMinRate) / (1 - yMinRate)) *
      plotHeight;
  const tooltipRows = (item: (typeof points)[number]) => [
    `${scoreLabel}：${formatPercent(item.hitRate)}（${item.hitCount}/${item.scoreDenominator ?? item.successCount}）`,
    `P50 耗时：${formatRequestDuration(item.p50DurationMs)}`,
    `请求成功率：${formatPercent(item.requestSuccessRate)}（${item.requestSuccessCount}/${item.totalRequests}）`,
    `平均耗时：${formatRequestDuration(item.averageDurationMs)}`,
    `P90/P95：${formatRequestDuration(item.p90DurationMs)} / ${formatRequestDuration(item.p95DurationMs)}`,
  ];
  const updateTooltip = (
    event: MouseEvent<SVGElement>,
    item: (typeof points)[number],
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltip({
      x: event.clientX - rect.left + 14,
      y: event.clientY - rect.top + 14,
      title: item.modelAlias,
      rows: tooltipRows(item),
    });
  };

  const families = Array.from(
    new Set(points.map((item) => item.family || 'unknown')),
  );

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, mb: 1.5, backgroundColor: '#fbfcff' }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
          gap={1}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              越往左上角准确率越高，耗时越短
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {families.map((family) => (
              <Stack
                key={family}
                direction="row"
                spacing={0.5}
                alignItems="center"
              >
                <Typography variant="caption" color="text.secondary">
                  {family}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
        <Box sx={{ width: '100%', overflowX: 'auto' }}>
          <Box
            sx={{
              position: 'relative',
              minWidth: 720,
              width: '100%',
            }}
          >
            <Box
              component="svg"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`模型${scoreLabel}和 P50 耗时散点图`}
              onMouseLeave={() => setTooltip(null)}
              sx={{ display: 'block', width: '100%', height: 'auto' }}
            >
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={height - padding.bottom}
                stroke="#cfd8dc"
              />
              <line
                x1={padding.left}
                y1={height - padding.bottom}
                x2={width - padding.right}
                y2={height - padding.bottom}
                stroke="transparent"
              />
              {(scoreLabel === '答对率'
                ? [0, 0.25, 0.5, 0.75, 1]
                : [0.5, 0.75, 1]
              ).map((rate) => (
                <g key={rate}>
                  <line
                    x1={padding.left}
                    y1={y(rate)}
                    x2={width - padding.right}
                    y2={y(rate)}
                    stroke={rate === yMinRate ? '#90a4ae' : '#edf1f5'}
                    strokeWidth={rate === yMinRate ? 2 : 1}
                  />
                  <text
                    x={padding.left - 10}
                    y={y(rate) + 4}
                    textAnchor="end"
                    fontSize={12}
                    fill="#607d8b"
                  >
                    {(rate * 100).toFixed(0)}%
                  </text>
                </g>
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const duration = xMax * ratio;
                return (
                  <g key={ratio}>
                    <line
                      x1={x(duration)}
                      y1={padding.top}
                      x2={x(duration)}
                      y2={height - padding.bottom}
                      stroke="#f4f6f8"
                    />
                    <text
                      x={x(duration)}
                      y={height - padding.bottom + 22}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#607d8b"
                    >
                      {formatRequestDuration(duration)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={padding.left}
                y1={y(avgHitRate)}
                x2={width - padding.right}
                y2={y(avgHitRate)}
                stroke="#ff9800"
                strokeDasharray="6 5"
              />
              <line
                x1={x(medianP50)}
                y1={padding.top}
                x2={x(medianP50)}
                y2={height - padding.bottom}
                stroke="#ff9800"
                strokeDasharray="6 5"
              />
              <text
                x={width - padding.right}
                y={y(avgHitRate) - 8}
                textAnchor="end"
                fontSize={12}
                fill="#ef6c00"
              >
                平均{scoreLabel}
              </text>
              <text
                x={x(medianP50) + 8}
                y={padding.top + 14}
                fontSize={12}
                fill="#ef6c00"
              >
                中位 P50
              </text>
              {points.map((item) => {
                const logoSrc = getModelLogoSrc(item.logo, item.logoDataUri);
                const centerX = x(item.p50DurationMs);
                const centerY = y(item.hitRate ?? 0);
                const badgeText = modelBadgeText(
                  item.shortName,
                  item.modelAlias,
                );
                const badgeWidth = badgeText
                  ? Math.max(
                      SCATTER_BADGE_MIN_WIDTH,
                      badgeText.length * SCATTER_BADGE_CHAR_WIDTH,
                    )
                  : 0;
                return (
                  <g key={item.modelId}>
                    {logoSrc ? (
                      <image
                        href={logoSrc}
                        x={centerX - SCATTER_LOGO_SIZE / 2}
                        y={centerY - SCATTER_LOGO_SIZE / 2}
                        width={SCATTER_LOGO_SIZE}
                        height={SCATTER_LOGO_SIZE}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    ) : (
                      <>
                        <circle
                          cx={centerX}
                          cy={centerY}
                          r={4.5}
                          fill="#607d8b"
                        />
                        <text
                          x={centerX + 7}
                          y={centerY - 6}
                          textAnchor="start"
                          fontSize={10}
                          fontWeight={700}
                          fill="#455a64"
                          pointerEvents="none"
                        >
                          {item.modelAlias}
                        </text>
                      </>
                    )}
                    {badgeText ? (
                      <g pointerEvents="none">
                        <rect
                          x={centerX + SCATTER_BADGE_OFFSET_X}
                          y={centerY + SCATTER_BADGE_OFFSET_Y}
                          width={badgeWidth}
                          height={SCATTER_BADGE_HEIGHT}
                          rx={SCATTER_BADGE_HEIGHT / 2}
                          fill={SCATTER_BADGE_COLOR}
                          stroke="#fff"
                          strokeWidth={1}
                        />
                        <text
                          x={centerX + SCATTER_BADGE_OFFSET_X + badgeWidth / 2}
                          y={
                            centerY +
                            SCATTER_BADGE_OFFSET_Y +
                            SCATTER_BADGE_HEIGHT -
                            1.8
                          }
                          textAnchor="middle"
                          fontSize={SCATTER_BADGE_FONT_SIZE}
                          fontWeight={800}
                          fill="#fff"
                        >
                          {badgeText}
                        </text>
                      </g>
                    ) : null}
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={18}
                      fill="transparent"
                      pointerEvents="all"
                      onMouseEnter={(event) => updateTooltip(event, item)}
                      onMouseMove={(event) => updateTooltip(event, item)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  </g>
                );
              })}
              <text
                x={padding.left + plotWidth / 2}
                y={height - 7}
                textAnchor="middle"
                fontSize={13}
                fill="#455a64"
              >
                P50 请求耗时
              </text>
              <text
                x={18}
                y={padding.top + plotHeight / 2}
                textAnchor="middle"
                fontSize={13}
                fill="#455a64"
                transform={`rotate(-90 18 ${padding.top + plotHeight / 2})`}
              >
                {scoreLabel}
                {scoreLabel === '答对率' ? '' : '（从 50% 开始）'}
              </text>
            </Box>
            {tooltip ? (
              <Box
                sx={{
                  position: 'absolute',
                  left: tooltip.x,
                  top: tooltip.y,
                  zIndex: 2,
                  maxWidth: 260,
                  pointerEvents: 'none',
                  backgroundColor: 'rgba(15, 23, 42, 0.92)',
                  color: '#fff',
                  borderRadius: 1,
                  px: 1,
                  py: 0.75,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 800, display: 'block' }}
                >
                  {tooltip.title}
                </Typography>
                {tooltip.rows.map((row) => (
                  <Typography
                    key={row}
                    variant="caption"
                    sx={{ display: 'block', lineHeight: 1.45, opacity: 0.9 }}
                  >
                    {row}
                  </Typography>
                ))}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

export function ReportApp({ data }: { data: ReportData }) {
  const [platformFilter, setPlatformFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [caseSearch, setCaseSearch] = useState('');
  const [basicOpen, setBasicOpen] = useState(true);
  const [codeVersionOpen, setCodeVersionOpen] = useState(false);
  const [colorLegendOpen, setColorLegendOpen] = useState(false);
  const [modelDiffOpen, setModelDiffOpen] = useState(true);
  const [scatterOpen, setScatterOpen] = useState(false);
  const [cellDetailInfo, setCellDetailInfo] = useState<CellDetailInfo | null>(
    null,
  );
  const [cellImageNatDims, setCellImageNatDims] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [showGtBox, setShowGtBox] = useState(false);
  const [showResultBboxes, setShowResultBboxes] = useState(false);
  const [showRawResponseAlways, setShowRawResponseAlways] = useState(false);

  const scoringMode =
    data.scoringMode ??
    (data.imageDetails.some(
      (detail) =>
        detail.expectedOutcome === 'refusal' ||
        detail.requests.some(
          (request) => typeof request.locate.answerCorrect === 'boolean',
        ),
    )
      ? 'answer'
      : 'legacy');
  const isAnswerScoring = scoringMode === 'answer';
  const scoreLabel = isAnswerScoring ? '答对率' : '命中率';

  const requestSuccessRate =
    data.totals.requestCount > 0
      ? (
          (data.totals.requestSuccessCount / data.totals.requestCount) *
          100
        ).toFixed(1)
      : null;

  const imageMetaMap = useMemo(() => {
    const map = new Map<string, CaseImageMeta>();
    for (const detail of data.imageDetails) {
      const key = makeImageKey(
        detail.caseName,
        detail.imageName,
        detail.imageType,
      );
      if (!map.has(key)) {
        map.set(key, {
          gtBox: detail.gtBox,
          expectedOutcome: detail.expectedOutcome,
          imageRelativePath: detail.imageRelativePath,
          imageWidth: detail.imageWidth,
          imageHeight: detail.imageHeight,
          caseTags: detail.caseTags,
        });
      }
    }
    return map;
  }, [data.imageDetails]);

  const allTableData = useMemo(
    () => buildModelDiffTableData(data.task, imageMetaMap, scoringMode),
    [data.task, imageMetaMap, scoringMode],
  );
  const localTableData = useMemo(
    () =>
      allTableData
        ? {
            ...allTableData,
            rows: allTableData.rows.filter((row) => {
              const record = data.caseCatalog.find(
                (item) => item.caseName === row.caseName,
              );
              if (!record) return false;
              const { platform, category } = getCaseClassification(record);
              const search = caseSearch.trim().toLowerCase();
              return (
                (platformFilter === 'All' || platform === platformFilter) &&
                (categoryFilter === 'All' || category === categoryFilter) &&
                (!search ||
                  `${record.caseName} ${record.prompt} ${record.fallbackPrompt}`
                    .toLowerCase()
                    .includes(search))
              );
            }),
          }
        : null,
    [
      allTableData,
      data.caseCatalog,
      platformFilter,
      categoryFilter,
      caseSearch,
    ],
  );
  const modelSummaryMap = useMemo(
    () => new Map(data.modelSummaries.map((item) => [item.modelId, item])),
    [data.modelSummaries],
  );
  const maxModelDurationMs = useMemo(
    () =>
      Math.max(
        0,
        ...data.modelSummaries.flatMap((item) => [
          item.averageDurationMs,
          item.p50DurationMs,
          item.p90DurationMs,
          item.p95DurationMs,
          item.maxDurationMs,
        ]),
      ),
    [data.modelSummaries],
  );

  const cellDetailData = useMemo(() => {
    if (!cellDetailInfo) return null;

    const {
      modelId,
      caseName,
      promptType,
      imageName,
      imageType,
      imageOptions,
    } = cellDetailInfo;
    const selectedImage = imageOptions?.find(
      (option) =>
        option.promptType === promptType &&
        option.imageName === imageName &&
        option.imageType === imageType,
    ) ?? {
      promptType,
      imageName,
      imageType,
    };
    const imageDetail = data.imageDetails.find(
      (item) =>
        item.modelId === modelId &&
        item.caseName === caseName &&
        item.promptType === selectedImage.promptType &&
        item.imageName === selectedImage.imageName &&
        item.imageType === selectedImage.imageType,
    );
    if (!imageDetail) return null;

    const imageMeta = imageMetaMap.get(
      makeImageKey(caseName, selectedImage.imageName, selectedImage.imageType),
    );
    const caseCatalogItem = data.caseCatalog.find(
      (item) => item.caseName === caseName,
    );
    const promptText =
      selectedImage.promptType === 'fallback'
        ? caseCatalogItem?.fallbackPrompt?.trim() ||
          caseCatalogItem?.prompt ||
          ''
        : caseCatalogItem?.prompt || '';

    return {
      requests: imageDetail.requests,
      plannedRequestCount: imageDetail.plannedRequestCount,
      pendingRequestCount: imageDetail.pendingRequestCount,
      gtBox: imageMeta?.gtBox ?? null,
      expectedOutcome: imageMeta?.expectedOutcome,
      imageRelativePath: imageMeta?.imageRelativePath ?? '',
      imageWidth: imageMeta?.imageWidth ?? null,
      imageHeight: imageMeta?.imageHeight ?? null,
      promptType: imageDetail.promptType,
      promptText,
      imageOptions:
        imageOptions ??
        buildCaseSummaryOptions(data.task, caseName, selectedImage.promptType),
    };
  }, [cellDetailInfo, data.imageDetails, data.task, imageMetaMap]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', py: 3, px: { xs: 0.6, md: 1.2 } }}>
        <Box
          sx={{
            maxWidth: 1700,
            mx: 'auto',
          }}
        >
          <Box
            sx={{
              px: { xs: 2, md: 3.5 },
              py: { xs: 2.5, md: 3.5 },
              borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
              backgroundColor: '#fff',
            }}
          >
            <Typography
              variant="h3"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2rem', md: '2.6rem' },
                letterSpacing: '-0.03em',
                color: '#243047',
              }}
            >
              {data.title}
            </Typography>
            <Stack spacing={0.6} sx={{ mt: 1.2, color: '#5f6b82' }}>
              <Typography variant="body1">
                评测目标：{data.task.runConfig?.meta.objective || '（未填写）'}
              </Typography>
              <Typography variant="body1">
                报告生成时间：{formatDateTime(data.generatedAt)}
              </Typography>
            </Stack>
          </Box>

          <Stack spacing={1.25} sx={{ p: { xs: 0.8, md: 1.2 } }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              <Chip size="small" label={formatDateTime(data.task.createdAt)} />
              <Chip
                size="small"
                label={statusLabel(data.task.status)}
                color={
                  {
                    pending: 'default',
                    running: 'primary',
                    completed: 'success',
                    failed: 'error',
                    stopped: 'warning',
                  }[data.task.status] as
                    | 'default'
                    | 'primary'
                    | 'success'
                    | 'error'
                    | 'warning'
                }
                variant={data.task.status === 'running' ? 'outlined' : 'filled'}
              />
              {data.task.completedAt ? (
                <Chip
                  size="small"
                  label={`完成于 ${formatDateTime(data.task.completedAt)}`}
                />
              ) : null}
              <Chip
                size="small"
                label={`模型请求成功率 ${requestSuccessRate !== null ? `${requestSuccessRate}%` : 'N/A'}`}
              />
            </Stack>

            {data.task.status === 'failed' && data.task.error ? (
              <Alert severity="error" variant="outlined">
                <Stack spacing={0.5}>
                  <Typography variant="body2">{data.task.error}</Typography>
                  <ErrorDebugDisclosure
                    errorDetail={data.task.errorDetail}
                    summaryText={data.task.error}
                  />
                </Stack>
              </Alert>
            ) : null}

            {data.totals.pendingRequestCount > 0 ? (
              <Alert severity="warning">
                评测未完成：已执行 {data.totals.requestCount}/
                {data.totals.plannedRequestCount} 次， 还有{' '}
                {data.totals.pendingRequestCount} 次未执行。
                下方占比按固定计划分母统计，仅表示当前已确认通过的占比；未执行不标记为模型失败。
              </Alert>
            ) : null}
            <CategorySummary data={data} />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <TextField
                select
                size="small"
                label="平台"
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                sx={{ minWidth: 120 }}
              >
                {['All', 'Web', 'Mobile', 'PC', 'Unknown'].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value === 'All' ? '全部平台' : value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="分类"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                sx={{ minWidth: 140 }}
              >
                {['All', ...CASE_CATEGORIES, 'Unknown'].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value === 'All' ? '全部分类' : value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="搜索 case / query"
                value={caseSearch}
                onChange={(event) => setCaseSearch(event.target.value)}
                sx={{ flexGrow: 1, minWidth: 220 }}
              />
              <Typography variant="caption" sx={{ alignSelf: 'center' }}>
                筛选逐题矩阵；上方分类成绩保留完整结果。
              </Typography>
            </Stack>

            <ToggleSection
              title="基础信息"
              open={basicOpen}
              onToggle={() => setBasicOpen((v) => !v)}
            >
              <Box sx={{ mt: 0.5 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Chip
                    size="small"
                    label={`迭代 ${data.task.params.iterations}`}
                  />
                  <Chip
                    size="small"
                    label={`图片: ${[
                      data.task.params.useHdImage ? '高清图' : null,
                      data.task.params.useSdImage ? '标清图' : null,
                    ]
                      .filter(Boolean)
                      .join(' / ')}`}
                  />
                  <Chip
                    size="small"
                    label={`模型: ${
                      data.task.params.selectedModels
                        .map((item) => item.alias)
                        .join(', ') || '（无）'
                    }`}
                  />
                  {data.task.params.useDeepLocate ? (
                    <Chip size="small" label="deepLocate: 开启" />
                  ) : (
                    <Chip size="small" label="deepLocate: 关闭" />
                  )}
                  <Chip
                    size="small"
                    label={`定位实现: ${data.task.params.locateImplementation}`}
                  />
                </Stack>

                <Stack spacing={0.4} sx={{ mt: 1.2 }}>
                  <Typography variant="body2" sx={{ color: '#40506c' }}>
                    <strong>Run ID：</strong>
                    {data.task.runConfig?.execution.runId || data.task.id}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#40506c' }}>
                    <strong>Prompt Source：</strong>
                    {data.task.runConfig?.selection.promptSource || 'fallback'}
                  </Typography>
                </Stack>
              </Box>
            </ToggleSection>

            <ToggleSection
              title="代码版本"
              open={codeVersionOpen}
              onToggle={() => setCodeVersionOpen((v) => !v)}
            >
              <Box sx={{ mt: 0.5 }}>
                <Stack spacing={2}>
                  {[
                    {
                      title: '当前仓库代码版本',
                      version: data.task.codeVersion,
                    },
                    {
                      title: 'Midscene 代码版本',
                      version: data.task.midsceneCodeVersion,
                    },
                  ].map((section) => (
                    <Paper
                      key={section.title}
                      variant="outlined"
                      sx={{ p: 1.5, backgroundColor: '#fbfcff' }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, mb: 1 }}
                      >
                        {section.title}
                      </Typography>
                      <Stack spacing={0.6}>
                        <Typography variant="body2">
                          <strong>分支：</strong>
                          {section.version?.branch ?? 'N/A'}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ wordBreak: 'break-all' }}
                        >
                          <strong>提交：</strong>
                          {section.version?.commitHash ?? 'N/A'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>工作区状态：</strong>{' '}
                          {section.version?.isDirty ? (
                            <Box
                              component="span"
                              sx={{ color: '#c62828', fontWeight: 700 }}
                            >
                              存在未提交改动
                            </Box>
                          ) : (
                            '干净'
                          )}
                        </Typography>
                      </Stack>

                      <Box component="details" sx={{ mt: 1 }}>
                        <Box
                          component="summary"
                          sx={{ cursor: 'pointer', fontWeight: 700 }}
                        >
                          Dirty Files
                        </Box>
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.5, mt: 1, backgroundColor: '#fafafa' }}
                        >
                          <Typography
                            component="pre"
                            variant="body2"
                            sx={{
                              m: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontFamily: 'monospace',
                            }}
                          >
                            {(section.version?.dirtyFiles ?? []).join('\n') ||
                              '（空）'}
                          </Typography>
                        </Paper>
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            </ToggleSection>

            <ReportColorLegendSection
              scoreLabel={scoreLabel}
              open={colorLegendOpen}
              onToggle={() => setColorLegendOpen((v) => !v)}
            />

            <ToggleSection
              title={
                isAnswerScoring
                  ? '不同模型的答案正确率差异'
                  : '不同模型的定位成功率差异'
              }
              open={modelDiffOpen}
              onToggle={() => setModelDiffOpen((v) => !v)}
            >
              {localTableData ? (
                <Box sx={{ mt: 0.5 }}>
                  <ToggleSection
                    title={`${scoreLabel}和 P50 耗时散点图`}
                    open={scatterOpen}
                    onToggle={() => setScatterOpen((v) => !v)}
                  >
                    <ModelPerformanceScatter
                      summaries={data.modelSummaries}
                      scoreLabel={scoreLabel}
                    />
                  </ToggleSection>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ maxHeight: 700 }}
                  >
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              minWidth: 72,
                              width: 72,
                              position: 'sticky',
                              left: 0,
                              zIndex: 4,
                              backgroundColor: '#fff',
                            }}
                          >
                            编号
                          </TableCell>
                          <TableCell
                            sx={{
                              fontWeight: 700,
                              minWidth: 160,
                              position: 'sticky',
                              left: 72,
                              zIndex: 3,
                              backgroundColor: '#fff',
                            }}
                          >
                            Case
                          </TableCell>
                          {localTableData.columns.map((col) => (
                            <TableCell
                              key={col.modelId}
                              align="center"
                              sx={{ fontWeight: 700, minWidth: 100 }}
                            >
                              {col.modelAlias}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {[
                          {
                            key: 'hitRate',
                            label: isAnswerScoring ? '答对率' : '定位命中率',
                            kind: 'rate',
                            tooltip: isAnswerScoring
                              ? '正确答案数 / 全部计划请求数（含明确拒答、请求失败与单独标注的未执行）'
                              : '命中次数 / 请求成功且可解析次数',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.hitRate ?? null,
                          },
                          {
                            key: 'requestSuccessRate',
                            label: '请求成功率',
                            kind: 'rate',
                            tooltip: '无 error 请求数 / 总请求数',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)
                                ?.requestSuccessRate ?? null,
                          },
                          {
                            key: 'averageDurationMs',
                            label: '平均耗时',
                            kind: 'duration',
                            tooltip: '只统计无 error 请求',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.averageDurationMs ??
                              0,
                          },
                          {
                            key: 'p50DurationMs',
                            label: 'P50 耗时',
                            kind: 'duration',
                            tooltip: '只统计无 error 请求',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.p50DurationMs ?? 0,
                          },
                          {
                            key: 'p90DurationMs',
                            label: 'P90 耗时',
                            kind: 'duration',
                            tooltip: '只统计无 error 请求',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.p90DurationMs ?? 0,
                          },
                          {
                            key: 'p95DurationMs',
                            label: 'P95 耗时',
                            kind: 'duration',
                            tooltip: '只统计无 error 请求',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.p95DurationMs ?? 0,
                          },
                          {
                            key: 'maxDurationMs',
                            label: '最慢耗时',
                            kind: 'duration',
                            tooltip: '只统计无 error 请求',
                            value: (modelId: string) =>
                              modelSummaryMap.get(modelId)?.maxDurationMs ?? 0,
                          },
                        ].map((summaryRow, summaryRowIndex) => (
                          <TableRow key={summaryRow.key}>
                            <TableCell
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                position: 'sticky',
                                left: 0,
                                backgroundColor:
                                  rowBaseBackground(summaryRowIndex),
                                zIndex: 2,
                              }}
                            >
                              -
                            </TableCell>
                            <TableCell
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                position: 'sticky',
                                left: 72,
                                backgroundColor:
                                  rowBaseBackground(summaryRowIndex),
                                zIndex: 1,
                              }}
                            >
                              <Tooltip title={summaryRow.tooltip}>
                                <span>{summaryRow.label}</span>
                              </Tooltip>
                            </TableCell>
                            {localTableData.columns.map((col) => {
                              const value = summaryRow.value(col.modelId);
                              const summary = modelSummaryMap.get(col.modelId);
                              const colors =
                                summaryRow.kind === 'rate'
                                  ? getRateCellColors(value as number | null)
                                  : durationCellColors(
                                      Number(value),
                                      maxModelDurationMs,
                                    );
                              return (
                                <TableCell
                                  key={col.modelId}
                                  align="center"
                                  sx={{
                                    background: layerRowTint(
                                      colors.backgroundColor,
                                      summaryRowIndex,
                                    ),
                                    color: colors.color,
                                    fontWeight: 700,
                                  }}
                                >
                                  <Tooltip
                                    title={
                                      summaryRow.key === 'requestSuccessRate'
                                        ? `${summary?.requestSuccessCount ?? 0}/${summary?.totalRequests ?? 0} 次请求成功`
                                        : summaryRow.key === 'hitRate'
                                          ? isAnswerScoring
                                            ? `${summary?.hitCount ?? 0}/${summary?.scoreDenominator ?? summary?.totalRequests ?? 0} 次答对`
                                            : `${summary?.hitCount ?? 0}/${summary?.successCount ?? 0} 次命中`
                                          : summaryRow.tooltip
                                    }
                                  >
                                    <span>
                                      {summaryRow.kind === 'rate'
                                        ? formatPercent(
                                            value as number | null,
                                            {
                                              avoidRoundedHundred: true,
                                            },
                                          )
                                        : formatRequestDuration(Number(value))}
                                    </span>
                                  </Tooltip>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                        {localTableData.rows.map((row, rowIndex) => {
                          const caseTags = getCaseTags(
                            data.caseCatalog,
                            row.caseName,
                          );
                          const caseRowBackground = rowBaseBackground(rowIndex);
                          return (
                            <TableRow key={row.key}>
                              <TableCell
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.8rem',
                                  position: 'sticky',
                                  left: 0,
                                  backgroundColor: caseRowBackground,
                                  zIndex: 2,
                                }}
                              >
                                {rowIndex + 1}
                              </TableCell>
                              <TableCell
                                sx={{
                                  fontWeight: 600,
                                  fontSize: '0.8rem',
                                  position: 'sticky',
                                  left: 72,
                                  backgroundColor: caseRowBackground,
                                  zIndex: 1,
                                }}
                              >
                                <CaseNameCell
                                  displayName={row.displayName}
                                  imageType={row.imageType}
                                  caseTags={caseTags}
                                />
                                {imageMetaMap.get(
                                  makeImageKey(
                                    row.caseName,
                                    row.imageName,
                                    row.imageType,
                                  ),
                                )?.expectedOutcome === 'refusal' ? (
                                  <Chip
                                    size="small"
                                    color="warning"
                                    label="GT 无目标"
                                    sx={{ ml: 0.5 }}
                                  />
                                ) : null}
                              </TableCell>
                              {localTableData.columns.map((col) => {
                                const cell = localTableData.cells
                                  .get(row.key)
                                  ?.get(col.modelId);
                                if (!cell) {
                                  return (
                                    <TableCell
                                      key={col.modelId}
                                      align="center"
                                      sx={{
                                        background: layerRowTint(
                                          '#e0e0e0',
                                          rowIndex,
                                        ),
                                        color: '#616161',
                                        fontWeight: 600,
                                      }}
                                    >
                                      N/A
                                    </TableCell>
                                  );
                                }

                                const lowConfidence = cell.pending > 0;
                                const rateCellColors = cell.noData
                                  ? getRateCellColors(null, lowConfidence)
                                  : getRateCellColors(
                                      cell.accuracy,
                                      lowConfidence,
                                    );

                                return (
                                  <TableCell
                                    key={col.modelId}
                                    align="center"
                                    onClick={() => {
                                      setCellImageNatDims(null);
                                      setCellDetailInfo({
                                        modelId: col.modelId,
                                        modelAlias: col.modelAlias,
                                        caseName: row.caseName,
                                        promptType: row.promptType,
                                        imageName: row.imageName,
                                        imageType: row.imageType,
                                      });
                                    }}
                                    sx={{
                                      background: layerRowTint(
                                        cell.hasError
                                          ? ERROR_CELL_COLORS.backgroundColor
                                          : rateCellColors.backgroundColor,
                                        rowIndex,
                                      ),
                                      color: cell.hasError
                                        ? ERROR_CELL_COLORS.color
                                        : rateCellColors.color,
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      '&:hover': {
                                        opacity: 0.8,
                                      },
                                    }}
                                  >
                                    <Tooltip
                                      title={`${scoreLabel} ${(cell.accuracy * 100).toFixed(0)}%（${cell.correct}/${cell.total} 次${isAnswerScoring ? `答对；分母为计划请求次数；未执行 ${cell.pending}` : '命中；分母为请求成功且可解析次数'}）`}
                                    >
                                      <span>
                                        {cell.noData
                                          ? '待执行'
                                          : `${(cell.accuracy * 100).toFixed(0)}%${cell.pending ? ` · 待执行 ${cell.pending}` : ''}`}
                                      </span>
                                    </Tooltip>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.75, display: 'block' }}
                  >
                    点击表格中的{scoreLabel}
                    单元格，可以查看对应图片的叠框细节与模型原始返回。
                  </Typography>
                </Box>
              ) : (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  任务详情尚未加载完成
                </Typography>
              )}
            </ToggleSection>
          </Stack>
        </Box>

        <Dialog
          open={Boolean(cellDetailInfo)}
          onClose={() => setCellDetailInfo(null)}
          fullWidth
          maxWidth="lg"
        >
          {cellDetailInfo && cellDetailData ? (
            <>
              <DialogTitle>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="h6">
                    {cellDetailInfo.caseName} - {cellDetailInfo.imageName} (
                    {cellDetailInfo.modelAlias})
                  </Typography>
                  <Button onClick={() => setCellDetailInfo(null)}>关闭</Button>
                </Stack>
              </DialogTitle>
              <DialogContent>
                <Stack spacing={2}>
                  {cellDetailData.imageOptions.length > 1 ? (
                    <Stack
                      direction="row"
                      spacing={0.75}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {cellDetailData.imageOptions.map((option) => {
                        const selected =
                          option.promptType === cellDetailInfo.promptType &&
                          option.imageName === cellDetailInfo.imageName &&
                          option.imageType === cellDetailInfo.imageType;
                        return (
                          <Chip
                            key={`${option.promptType}-${option.imageName}-${option.imageType}`}
                            size="small"
                            label={`${option.imageName} · ${imageTypeLabel[option.imageType]}`}
                            color={selected ? 'primary' : 'default'}
                            variant={selected ? 'filled' : 'outlined'}
                            onClick={() => {
                              setCellImageNatDims(null);
                              setCellDetailInfo((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      promptType: option.promptType,
                                      imageName: option.imageName,
                                      imageType: option.imageType,
                                    }
                                  : prev,
                              );
                            }}
                          />
                        );
                      })}
                    </Stack>
                  ) : null}

                  <Box
                    sx={{
                      border: '1px solid rgba(15, 23, 42, 0.12)',
                      borderRadius: 1.5,
                      p: 1.25,
                      backgroundColor: '#fafbff',
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        本次使用提示词
                      </Typography>
                      <Chip
                        size="small"
                        color={
                          cellDetailData.promptType === 'fallback'
                            ? 'warning'
                            : 'default'
                        }
                        label={
                          cellDetailData.promptType === 'fallback'
                            ? '使用了备用提示词'
                            : '使用了主提示词'
                        }
                      />
                    </Stack>
                    <Typography
                      variant="caption"
                      component="pre"
                      sx={{
                        mt: 0.9,
                        mb: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                        fontSize: '0.76rem',
                        color: '#1f2937',
                        backgroundColor: '#fff',
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        borderRadius: 1,
                        p: 1,
                        maxHeight: 220,
                        overflow: 'auto',
                      }}
                    >
                      {cellDetailData.promptText || '（提示词为空）'}
                    </Typography>
                  </Box>

                  {cellDetailData.expectedOutcome === 'refusal' ? (
                    <Chip
                      size="small"
                      color="warning"
                      label="GT 无目标 · 应明确拒答"
                      sx={{ alignSelf: 'flex-start' }}
                    />
                  ) : null}
                  {cellDetailData.gtBox ? (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={showGtBox}
                          onChange={(event) =>
                            setShowGtBox(event.target.checked)
                          }
                        />
                      }
                      label={
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ flexWrap: 'wrap' }}
                        >
                          <span>显示正确答案框</span>
                        </Stack>
                      }
                    />
                  ) : null}

                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={showResultBboxes}
                        onChange={(event) =>
                          setShowResultBboxes(event.target.checked)
                        }
                      />
                    }
                    label="展示定位结果框"
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={showRawResponseAlways}
                        onChange={(event) =>
                          setShowRawResponseAlways(event.target.checked)
                        }
                      />
                    }
                    label="总是展示原始返回"
                  />

                  <Box
                    sx={{
                      position: 'relative',
                      width: 'fit-content',
                      maxWidth: `min(100%, ${IMAGE_DISPLAY_MAX_WIDTH}px)`,
                    }}
                  >
                    <img
                      src={cellDetailData.imageRelativePath}
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        setCellImageNatDims({
                          w: img.naturalWidth,
                          h: img.naturalHeight,
                        });
                      }}
                      style={{
                        maxWidth: `min(100%, ${IMAGE_DISPLAY_MAX_WIDTH}px)`,
                        display: 'block',
                        border: '1px solid #bdbdbd',
                      }}
                      alt="定位图片"
                    />
                    {cellImageNatDims ? (
                      <svg
                        role="img"
                        aria-label="GT and model prediction overlays"
                        viewBox={`0 0 ${cellImageNatDims.w} ${cellImageNatDims.h}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none',
                        }}
                      >
                        {showGtBox && cellDetailData.gtBox ? (
                          <rect
                            x={cellDetailData.gtBox[0]}
                            y={cellDetailData.gtBox[1]}
                            width={
                              cellDetailData.gtBox[2] - cellDetailData.gtBox[0]
                            }
                            height={
                              cellDetailData.gtBox[3] - cellDetailData.gtBox[1]
                            }
                            fill="none"
                            stroke="#4caf50"
                            strokeWidth={Math.max(
                              1.5,
                              cellImageNatDims.w / 400,
                            )}
                            opacity={0.8}
                          />
                        ) : null}
                        {cellDetailData.requests.map((req, index) => {
                          const center = req.locate.center;
                          if (!center) return null;
                          const half = Math.max(1.7, cellImageNatDims.w / 450);
                          return (
                            <rect
                              key={`pt-${index}`}
                              x={center.x - half}
                              y={center.y - half}
                              width={half * 2}
                              height={half * 2}
                              fill="#f44336"
                              opacity={0.85}
                            />
                          );
                        })}
                        {showResultBboxes &&
                          cellDetailData.requests.map((req, index) => {
                            const bbox = req.locateDisplayBbox;
                            if (!bbox) return null;
                            const xMin = bbox.xMin;
                            const yMin = bbox.yMin;
                            const xMax = bbox.xMax;
                            const yMax = bbox.yMax;

                            if (
                              xMin === null ||
                              yMin === null ||
                              xMax === null ||
                              yMax === null
                            ) {
                              return null;
                            }

                            const width = xMax - xMin;
                            const height = yMax - yMin;
                            if (width <= 0 || height <= 0) return null;

                            return (
                              <rect
                                key={`bbox-${index}`}
                                x={xMin}
                                y={yMin}
                                width={width}
                                height={height}
                                fill="none"
                                stroke="#1e88e5"
                                strokeWidth={Math.max(
                                  1.2,
                                  cellImageNatDims.w / 700,
                                )}
                                opacity={0.8}
                              />
                            );
                          })}
                      </svg>
                    ) : null}
                  </Box>

                  {(() => {
                    let total = 0;
                    let success = 0;
                    let correct = 0;
                    for (const req of cellDetailData.requests) {
                      total++;
                      const requestSuccess = !req.error && req.locate.success;

                      if (requestSuccess) {
                        success++;
                      }
                      if (
                        isAnswerScoring
                          ? requestSuccess &&
                            (req.locate.answerCorrect === true ||
                              (req.locate.answerCorrect == null &&
                                req.locate.expectedOutcome !== 'refusal' &&
                                req.locate.hitGt))
                          : requestSuccess && req.locate.hitGt
                      ) {
                        correct++;
                      }
                    }

                    return (
                      <Typography variant="body2">
                        {scoreLabel}：
                        {(isAnswerScoring
                          ? cellDetailData.plannedRequestCount
                          : success) > 0
                          ? (
                              (correct /
                                (isAnswerScoring
                                  ? cellDetailData.plannedRequestCount
                                  : success)) *
                              100
                            ).toFixed(1)
                          : 0}
                        % ({correct}/
                        {isAnswerScoring
                          ? cellDetailData.plannedRequestCount
                          : success}{' '}
                        次{isAnswerScoring ? '答对' : '命中'})
                        {cellDetailData.pendingRequestCount
                          ? ` · 未执行 ${cellDetailData.pendingRequestCount} 次（未完成）`
                          : ''}
                        {' | 请求成功率：'}
                        {total > 0 ? ((success / total) * 100).toFixed(1) : 0}%(
                        {success}/{total} 次成功)
                      </Typography>
                    );
                  })()}

                  {cellDetailData.requests.length > 0 ? (
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}
                      >
                        模型返回结果
                      </Typography>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700, width: 90 }}>
                                编号
                              </TableCell>
                              <TableCell
                                sx={{ fontWeight: 700, minWidth: 190 }}
                              >
                                定位结果解析
                              </TableCell>
                              <TableCell
                                sx={{ fontWeight: 700, minWidth: 260 }}
                              >
                                原始返回
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, width: 120 }}>
                                请求耗时
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {cellDetailData.requests.map((req) => {
                              let parsedBbox: BBox | null = null;
                              let rawResponse: string | null = null;
                              let failureMessage: string | null = null;
                              let failureErrorText: string | null = null;
                              let failureErrorDetail: ErrorDetail | null = null;
                              const requestCenter = req.locate.center;
                              const requestSuccess =
                                !req.error && req.locate.success;
                              parsedBbox = req.locateDisplayBbox;
                              rawResponse = req.locate.rawResponse;
                              const httpStatus = extractHttpStatusCode(
                                req.error ?? req.locate.error,
                              );
                              if (httpStatus) {
                                failureMessage = `模型 HTTP 请求失败：${httpStatus}`;
                                failureErrorText =
                                  req.error ?? req.locate.error ?? null;
                                failureErrorDetail =
                                  req.errorDetail ??
                                  req.locate.errorDetail ??
                                  null;
                              } else if (req.error) {
                                failureMessage = `模型请求失败：${req.error}`;
                                failureErrorText = req.error;
                                failureErrorDetail = req.errorDetail ?? null;
                              } else if (req.locate.error) {
                                failureMessage = req.locate.error;
                                failureErrorText = req.locate.error;
                                failureErrorDetail =
                                  req.locate.errorDetail ?? null;
                              } else if (!req.locate.success) {
                                failureMessage = '模型返回已收到，但解析失败';
                              }

                              let bboxText = '（解析失败）';
                              if (parsedBbox) {
                                bboxText = `[${parsedBbox.xMin}, ${parsedBbox.yMin}, ${parsedBbox.xMax}, ${parsedBbox.yMax}]`;
                              } else if (requestCenter) {
                                bboxText = `point: [${requestCenter.x}, ${requestCenter.y}]`;
                              } else if (
                                req.locate.abstained &&
                                requestSuccess
                              ) {
                                bboxText = '（明确拒答：无目标）';
                              } else if (
                                failureMessage?.startsWith(
                                  '模型 HTTP 请求失败：',
                                )
                              ) {
                                bboxText = '（请求失败）';
                              }

                              const displayedAnswerCorrect =
                                requestSuccess &&
                                req.locate.answerCorrect === true;
                              const isIncorrectAnswer = Boolean(
                                requestSuccess &&
                                  (isAnswerScoring
                                    ? !displayedAnswerCorrect
                                    : requestCenter && !req.locate.hitGt),
                              );

                              return (
                                <TableRow
                                  key={`model-return-${req.iterationIndex}`}
                                  sx={
                                    isIncorrectAnswer
                                      ? {
                                          backgroundColor: '#fff1f1',
                                        }
                                      : undefined
                                  }
                                >
                                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    第 {req.iterationIndex} 次
                                  </TableCell>
                                  <TableCell>
                                    <Stack
                                      direction="row"
                                      spacing={0.75}
                                      alignItems="center"
                                    >
                                      <span>{bboxText}</span>
                                      {isAnswerScoring &&
                                      typeof req.locate.answerCorrect ===
                                        'boolean' ? (
                                        <Chip
                                          size="small"
                                          color={
                                            displayedAnswerCorrect
                                              ? 'success'
                                              : 'error'
                                          }
                                          label={
                                            displayedAnswerCorrect
                                              ? '答案正确'
                                              : '答案错误'
                                          }
                                        />
                                      ) : null}
                                    </Stack>
                                  </TableCell>
                                  <TableCell>
                                    {failureMessage || showRawResponseAlways ? (
                                      <Stack spacing={0.5}>
                                        {failureMessage ? (
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color: '#c62828',
                                              fontWeight: 700,
                                              display: 'block',
                                            }}
                                          >
                                            {failureMessage}
                                          </Typography>
                                        ) : null}
                                        {failureMessage ? (
                                          <ErrorDebugDisclosure
                                            errorDetail={failureErrorDetail}
                                            summaryText={failureErrorText}
                                          />
                                        ) : null}
                                        {failureMessage ===
                                          '模型返回已收到，但解析失败' ||
                                        showRawResponseAlways ||
                                        rawResponse?.trim() ? (
                                          <Typography
                                            variant="caption"
                                            component="pre"
                                            sx={{
                                              color: failureMessage
                                                ? '#c62828'
                                                : 'text.primary',
                                              whiteSpace: 'pre-wrap',
                                              wordBreak: 'break-all',
                                              fontFamily: 'monospace',
                                              fontSize: '0.75rem',
                                              backgroundColor: failureMessage
                                                ? '#ffebee'
                                                : '#f5f5f5',
                                              p: 0.5,
                                              borderRadius: 0.5,
                                              maxHeight: 120,
                                              overflow: 'auto',
                                              m: 0,
                                            }}
                                          >
                                            {rawResponse?.trim()
                                              ? rawResponse
                                              : '（模型返回为空）'}
                                          </Typography>
                                        ) : null}
                                      </Stack>
                                    ) : (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                      >
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    {formatRequestDuration(req.durationMs)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  ) : null}
                </Stack>
              </DialogContent>
            </>
          ) : null}
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
