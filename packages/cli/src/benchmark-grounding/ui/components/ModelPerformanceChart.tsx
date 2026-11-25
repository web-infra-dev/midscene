import { type CSSProperties, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { type ReportChart, economyRate } from '../../core/overview';
import {
  MatchingModelsContext,
  type ScatterLinkProps,
  ScatterPlot,
} from './ScatterPlot';

function ReportScatterLink({ href, ...props }: ScatterLinkProps) {
  return <Link to={href} {...props} />;
}

export function ModelPerformanceChart({
  chart,
  firstTestcase,
  onOpenTestcase,
}: {
  chart: ReportChart;
  firstTestcase?: string;
  onOpenTestcase: () => void;
}) {
  const {
    radar: { models, hasReference },
    scatter,
    families,
    familyWinners,
    budgetBounds: [minimumCases, maximumCases],
  } = chart;
  const [selectedModels, setSelectedModels] = useState<
    string[] | 'family-glory' | null
  >(null);
  const [selectedFamilies, setSelectedFamilies] = useState<string[] | null>(
    null,
  );
  const [budgetCases, setBudgetCases] = useState<number | null>(null);
  const budgetId = useId();
  const activeModels =
    selectedModels === 'family-glory' ? familyWinners : selectedModels;
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
            ({ model, family, economy }) =>
              (requiredCases === minimumCases ||
                (economyRate(economy) ?? 0) >= requiredCases) &&
              (selectedFamilies === null ||
                selectedFamilies.includes(family)) &&
              (activeModels === null || activeModels.includes(model)),
          )
          .map(({ model }) => model),
      ),
    [models, minimumCases, requiredCases, selectedFamilies, activeModels],
  );
  const legend = useMemo(
    () => (
      <ul className="model-performance-legend" aria-label="Models">
        {models.map((model) => (
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
                        aria-label={`${model.model}: Accuracy, Economy, and Performance. Accuracy uses 60–100%. Economy and Performance use shared logarithmic ranges. Higher Economy and shorter times are shown farther from the center.${model.free ? ' Free is shown at the outer edge.' : ''}`}
                      >
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={({ x, y, payload }) => {
                            const isPerformance =
                              payload.value === 'Performance';
                            const labelX = isPerformance
                              ? Math.max(8, Number(x) - 27)
                              : x;
                            return (
                              <text
                                x={labelX}
                                y={y}
                                textAnchor={isPerformance ? 'start' : 'middle'}
                                fill="#64748b"
                                fontSize={9}
                                dy={payload.index === 0 ? 0 : 11}
                              >
                                {payload.value}
                              </text>
                            );
                          }}
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
    [models, hasReference, activeModels],
  );

  return (
    <section className="model-performance">
      <header className="model-performance-heading">
        <h3>Model Performance Overview</h3>
      </header>
      <MatchingModelsContext.Provider value={matchingModels}>
        <div className="model-performance-canvas">
          <div className="model-scatter-viewport">
            <ScatterPlot
              scatter={scatter}
              firstTestcase={firstTestcase}
              onOpenTestcase={onOpenTestcase}
              LinkComponent={ReportScatterLink}
            />
          </div>
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
              {maximumCases > 0 ? (
                <>
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
                        Math.exp(event.currentTarget.valueAsNumber) -
                          budgetOffset,
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
                </>
              ) : (
                <div className="scatter-budget-heading">
                  {models.some(({ economy }) => economy === 'free')
                    ? 'Free models fit any budget.'
                    : 'No Economy estimates available.'}
                </div>
              )}
            </section>
            <section className="model-filter-section" aria-label="Family">
              <h5 className="model-filter-title">
                Family
                <button
                  type="button"
                  role="switch"
                  className="model-family-glory"
                  aria-checked={selectedModels === 'family-glory'}
                  title="Select each family's best models by higher accuracy, then shorter time, then higher Economy. Exact ties are included"
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
