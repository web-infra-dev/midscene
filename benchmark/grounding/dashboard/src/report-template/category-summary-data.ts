import type { ReportData } from './report-types';

export const CASE_CATEGORIES = [
  'Basic',
  'Functional',
  'Reason',
  'Refusal',
] as const;

type CaseMetadata = ReportData['caseCatalog'][number];

export function getCaseClassification(record: CaseMetadata) {
  const category =
    CASE_CATEGORIES.find((value) => value.toLowerCase() === record.taskClass) ??
    'Unknown';
  const platform =
    record.platform === 'mobile'
      ? 'Mobile'
      : record.platform === 'web'
        ? 'Web'
        : 'Unknown';
  return { category, platform };
}

export function summarizeCategories(data: ReportData) {
  const metadata = new Map(
    data.caseCatalog.map((record) => [
      record.caseName,
      getCaseClassification(record),
    ]),
  );
  const rows = new Map<
    string,
    {
      platform: string;
      category: string;
      scores: Map<string, { correct: number; total: number; pending: number }>;
    }
  >();
  for (const detail of data.imageDetails) {
    const { platform, category } = metadata.get(detail.caseName) ?? {
      platform: 'Unknown',
      category: 'Unknown',
    };
    for (const [rowPlatform, rowCategory] of [
      [platform, category],
      [platform, '合计'],
      ['All', '总计'],
    ]) {
      const key = `${rowPlatform}:${rowCategory}`;
      const row = rows.get(key) ?? {
        platform: rowPlatform,
        category: rowCategory,
        scores: new Map(),
      };
      const score = row.scores.get(detail.modelId) ?? {
        correct: 0,
        total: 0,
        pending: 0,
      };
      score.correct += detail.correctCount;
      score.total += detail.plannedRequestCount;
      score.pending += detail.pendingRequestCount;
      row.scores.set(detail.modelId, score);
      rows.set(key, row);
    }
  }
  const platformOrder = ['Web', 'Mobile', 'PC', 'Unknown', 'All'];
  const categoryOrder: readonly string[] = [
    ...CASE_CATEGORIES,
    'Unknown',
    '合计',
    '总计',
  ];
  return [...rows.values()].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform) ||
      categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category),
  );
}
