import { mean, meanBy, orderBy } from 'es-toolkit';
import type { ReportSummary, Result } from './schemas';
import { median } from './summary';

type ModelSummary = ReportSummary['models'][number];

export type ModelBadge = 'accuracy' | 'performance' | 'economy' | 'balance';

export type ReportScatterPoint = {
  model: string;
  performance: number;
  accuracy: number;
  economy: ModelSummary['economy'];
  balance: number | null;
  badges: ModelBadge[];
  color: string;
  icon?: string;
};

export type ResultStatus = 'missing' | 'error' | 'passed' | 'failed';

export function resultStatus(result?: Pick<Result, 'output'>): ResultStatus {
  if (!result) return 'missing';
  if (result.output.type === 'ERROR') return 'error';
  return result.output.correct ? 'passed' : 'failed';
}

export function formatEconomy(economy: ModelSummary['economy']) {
  if (economy === null) return '—';
  if (economy === 'free') return 'Free ($0)';
  return `${Math.floor(economy).toLocaleString('en-US')} cases / $1`;
}

export function economyRate(economy: ModelSummary['economy']) {
  return economy === 'free' ? Number.POSITIVE_INFINITY : economy;
}

function economyForSorting({ economy }: Pick<ModelSummary, 'economy'>) {
  return economyRate(economy) ?? Number.NEGATIVE_INFINITY;
}

function buildModelRadar(models: ModelSummary[]) {
  const dimensions = [
    { label: 'Accuracy', key: 'accuracy' as const },
    { label: 'Economy', key: 'economy' as const },
    { label: 'Performance', key: 'casesPerMinute' as const },
  ].map((dimension) => {
    const values = models
      .map((model) => model[dimension.key])
      .filter(
        (value): value is number =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (dimension.key === 'accuracy'
            ? value >= 0 && value <= 100
            : value > 0),
      )
      .sort((a, b) => a - b);
    return {
      ...dimension,
      minimum: dimension.key === 'accuracy' ? 60 : values[0],
      maximum: dimension.key === 'accuracy' ? 100 : values.at(-1),
      p50: median(values),
    };
  });
  const radarModels = models.map((model) => {
    const free = model.economy === 'free';
    const data = dimensions.map(({ label, key, minimum, maximum, p50 }) => {
      const [value, reference] = [model[key], p50].map((value) =>
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        maximum === undefined ||
        minimum === undefined ||
        (key !== 'accuracy' && value <= 0)
          ? null
          : key === 'accuracy'
            ? Math.min(
                100,
                Math.max(0, ((value - minimum) / (maximum - minimum)) * 100),
              )
            : maximum === minimum
              ? 100
              : ((Math.log10(value) - Math.log10(minimum)) /
                  (Math.log10(maximum) - Math.log10(minimum))) *
                100,
      );
      return {
        metric: label,
        value: key === 'economy' && free ? 100 : value,
        p50: reference,
      };
    });
    const [accuracy, economy, performance] = data.map(({ value }) =>
      Number.isFinite(value) ? value : null,
    );
    // All three axis gaps are 120°, so the sine factor cancels in the
    // ratio of the filled triangle to the full-scale triangle.
    const balance =
      accuracy === null || economy === null || performance === null
        ? null
        : (accuracy * economy +
            economy * performance +
            performance * accuracy) /
          300;
    const available = balance !== null;
    const title = [
      model.model,
      `Accuracy: ${model.accuracy === null ? 'Unavailable' : `${model.accuracy.toFixed(1)}%`}`,
      `Performance: ${model.performance.average === null ? 'Unavailable' : `${model.performance.average.toFixed(2)} s`}`,
      `Economy: ${formatEconomy(model.economy)}`,
      `Balance: ${balance?.toFixed(1) ?? 'Unavailable'}`,
      ...(!available
        ? [
            model.performance.average === 0
              ? 'A zero-second duration cannot be used for Balance'
              : !model.reference
                ? 'Missing pricing and performance data'
                : model.usage.complete === 0
                  ? 'No complete token usage'
                  : 'Economy or Performance estimate unavailable',
          ]
        : []),
    ].join('\n');
    return { ...model, data, available, title, free, balance };
  });
  return {
    models: radarModels,
    accuracyP50: dimensions[0].p50,
    hasReference: dimensions.every(({ p50 }) => p50 !== null),
  };
}

function familyWinners(models: ModelSummary[]) {
  const winners = new Map<string, ModelSummary[]>();
  for (const model of models) {
    if (model.accuracy === null || !Number.isFinite(model.accuracy)) continue;
    const family = winners.get(model.family);
    const best = family?.[0];
    const comparison = best
      ? model.accuracy - (best.accuracy ?? Number.NEGATIVE_INFINITY) ||
        (model.casesPerMinute ?? Number.NEGATIVE_INFINITY) -
          (best.casesPerMinute ?? Number.NEGATIVE_INFINITY) ||
        economyForSorting(model) - economyForSorting(best)
      : 1;
    if (comparison > 0) winners.set(model.family, [model]);
    else if (!comparison) family?.push(model);
  }
  return [...winners.values()].flat().map(({ model }) => model);
}

export function calculateReportChart(models: ModelSummary[]) {
  const radar = buildModelRadar(models);
  const points = radar.models
    .flatMap<ReportScatterPoint>((model) => {
      const { performance, accuracy } = model;
      if (
        performance.average === null ||
        !Number.isFinite(performance.average) ||
        performance.average < 0 ||
        accuracy === null ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 100
      )
        return [];
      return [
        {
          model: model.model,
          performance: performance.average,
          accuracy,
          economy: model.economy,
          balance: model.balance,
          badges: [],
          color: model.color,
          ...(model.icon ? { icon: model.icon } : {}),
        },
      ];
    })
    // SVG renders later models on top when points overlap.
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy ||
        b.performance - a.performance ||
        economyForSorting(a) - economyForSorting(b) ||
        a.model.localeCompare(b.model),
    );
  const balanceForSorting = (point: ReportScatterPoint) =>
    point.balance ?? Number.NEGATIVE_INFINITY;
  const [highestAccuracy] = orderBy(
    points,
    ['accuracy', 'performance', economyForSorting, 'model'],
    ['desc', 'asc', 'desc', 'asc'],
  );
  const [fastest] = orderBy(
    points,
    ['performance', 'accuracy', economyForSorting, 'model'],
    ['asc', 'desc', 'desc', 'asc'],
  );
  const [highestEconomy] = orderBy(
    points.filter(({ economy }) => economy !== null),
    [economyForSorting, 'accuracy', 'performance', 'model'],
    ['desc', 'desc', 'asc', 'asc'],
  );
  const [highestBalance] = orderBy(
    points,
    [balanceForSorting, 'accuracy', 'performance', economyForSorting, 'model'],
    ['desc', 'desc', 'asc', 'desc', 'asc'],
  );
  // The capsule uses the first badge. The tooltip shows every badge earned.
  fastest?.badges.push('performance');
  highestAccuracy?.badges.push('accuracy');
  highestEconomy?.badges.push('economy');
  if (highestBalance && highestBalance.balance !== null)
    highestBalance.badges.push('balance');

  const accuracies = models
    .map(({ accuracy }) => accuracy)
    .filter(
      (accuracy): accuracy is number =>
        accuracy !== null &&
        Number.isFinite(accuracy) &&
        accuracy >= 0 &&
        accuracy <= 100,
    );
  const accuracyDomain: [number, number] = [
    accuracies.length ? Math.max(0, Math.min(...accuracies) - 3) : 0,
    100,
  ];
  const dollarRates = models.flatMap(({ economy }) =>
    typeof economy === 'number' && Number.isFinite(economy) && economy > 0
      ? [economy]
      : [],
  );
  const budgetBounds: [number, number] = dollarRates.length
    ? [
        Math.floor(Math.min(...dollarRates) / 5) * 5,
        Math.ceil(Math.max(...dollarRates) / 1000) * 1000,
      ]
    : [0, 0];
  return {
    radar,
    scatter: {
      points,
      performanceP50: median(points.map(({ performance }) => performance)),
      accuracyP50: radar.accuracyP50,
      accuracyDomain,
    },
    families: [...new Set(models.map(({ family }) => family))].sort((a, b) =>
      a.localeCompare(b, 'en'),
    ),
    familyWinners: familyWinners(models),
    budgetBounds,
  };
}

type MatrixRowStatus = 'all-passed' | 'all-failed' | 'incomplete' | 'mixed';

export function calculateReportOverview({
  summary,
  testcaseNames,
  results,
}: {
  summary: ReportSummary;
  testcaseNames: string[];
  results: Result[];
}) {
  const models = summary.models
    .map(({ model }) => model)
    .sort()
    .reverse();
  const byTestcase = new Map<string, Map<string, ResultStatus>>();
  for (const result of results) {
    const { testcase, displayName } = result.input;
    const cells = byTestcase.get(testcase) ?? new Map<string, ResultStatus>();
    cells.set(displayName, resultStatus(result));
    byTestcase.set(testcase, cells);
  }
  const counts = {
    all: testcaseNames.length,
    'all-passed': 0,
    'all-failed': 0,
    incomplete: 0,
  };
  const rows = [...testcaseNames].sort().map((name) => {
    const outcomes = byTestcase.get(name);
    const cells = models.map((model) => outcomes?.get(model) ?? 'missing');
    const passed = cells.filter((status) => status === 'passed').length;
    const status: MatrixRowStatus =
      !cells.length || cells.includes('missing')
        ? 'incomplete'
        : passed === cells.length
          ? 'all-passed'
          : cells.every((status) => status === 'failed')
            ? 'all-failed'
            : 'mixed';
    if (status !== 'mixed') counts[status]++;
    return { name, cells, passed, status };
  });
  const accuracies = summary.models.flatMap(({ accuracy }) =>
    accuracy === null ? [] : [accuracy],
  );
  const average = accuracies.length ? mean(accuracies) : null;
  const accuracyDeviation =
    average === null
      ? null
      : Math.sqrt(meanBy(accuracies, (accuracy) => (accuracy - average) ** 2));
  return {
    chart: calculateReportChart(summary.models),
    matrix: { models, rows, counts, accuracyDeviation },
  };
}

export type ReportChart = ReturnType<typeof calculateReportChart>;
export type ReportOverview = ReturnType<typeof calculateReportOverview>;
