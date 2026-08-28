const COST_EFFICIENCY_IMAGE = {
  en: '/images/benchmarks/app-control-bench-cost-efficiency-en.png',
  zh: '/images/benchmarks/app-control-bench-cost-efficiency-zh.png',
} as const;

const PASS_AT_1_IMAGE = {
  en: '/images/benchmarks/app-control-bench-pass-at-1-en.png',
  zh: '/images/benchmarks/app-control-bench-pass-at-1-zh.png',
} as const;

const COMPARISON_COPY = {
  en: {
    costTitle: 'Cases completed per $1',
    costAriaLabel:
      'Cases completed per dollar by model and tool combination, comparing Midscene with agent-device iOS baselines; higher is better',
    passTitle: 'Pass@1 on the same 60 cases',
    passAriaLabel:
      'Pass at one on the same 60 cases by Midscene model, higher is better',
  },
  zh: {
    costTitle: '每 $1 完成的 case 数',
    costAriaLabel:
      'Midscene 与 agent-device iOS 基线各模型及工具组合每 1 美元完成的 case 数，越高越好',
    passTitle: '同一批 60 个 case 的 Pass@1',
    passAriaLabel: 'Midscene 不同模型在同一批 60 个 case 上的 Pass@1，越高越好',
  },
} as const;

interface AppControlBenchComparisonProps {
  locale: keyof typeof COMPARISON_COPY;
}

export function AppControlBenchComparison({
  locale,
}: AppControlBenchComparisonProps) {
  const copy = COMPARISON_COPY[locale];

  return (
    <>
      <style>{`
.app-control-comparison {
  display: grid;
  gap: 18px;
  margin: 28px 0 36px;
}

.app-control-comparison-image {
  margin: 0;
}

.app-control-comparison-image img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 18px;
}
`}</style>

      <section
        aria-label={`${copy.costTitle}; ${copy.passTitle}`}
        className="app-control-comparison"
      >
        <figure className="app-control-comparison-image">
          <img alt={copy.costAriaLabel} src={COST_EFFICIENCY_IMAGE[locale]} />
        </figure>
        <figure className="app-control-comparison-image">
          <img alt={copy.passAriaLabel} src={PASS_AT_1_IMAGE[locale]} />
        </figure>
      </section>
    </>
  );
}
