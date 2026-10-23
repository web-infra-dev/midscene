import { useState } from 'react';
import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  getNiceTickValues,
} from 'recharts';

const colors = [
  '#4f6bed',
  '#0d9488',
  '#9363d8',
  '#d88a26',
  '#d65379',
  '#487f9e',
];

export function ModelPerformanceChart({
  points,
  modelCount,
}: {
  points: {
    model: string;
    speed: number;
    costEfficiency: number;
  }[];
  modelCount: number;
}) {
  const [hiddenModels, setHiddenModels] = useState<string[]>([]);
  const [highlightedModel, setHighlightedModel] = useState<string | null>(null);
  const visiblePoints = points.filter(
    ({ model }) => !hiddenModels.includes(model),
  );
  const [xTicks, yTicks] = [
    Math.max(...points.map(({ speed }) => speed), 0),
    Math.max(...points.map(({ costEfficiency }) => costEfficiency), 0),
  ].map((maximum) => getNiceTickValues([0, maximum * 1.15 || 1], 6));

  return (
    <section className="model-performance">
      <header className="model-performance-heading">
        <h3>Model performance</h3>
        <span>Higher and farther right is better</span>
      </header>
      {points.length ? (
        <>
          <div className="performance-axis-caption">
            Cost efficiency <span>(pass/$)</span>
          </div>
          <div className="model-performance-plot">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ScatterChart
                margin={{ top: 30, right: 36, bottom: 20, left: 4 }}
                accessibilityLayer
                aria-label="Model performance: speed in passes per minute and cost efficiency in passes per dollar"
              >
                <CartesianGrid stroke="#e8edf4" strokeDasharray="3 5" />
                <XAxis
                  type="number"
                  dataKey="speed"
                  name="Speed"
                  domain={[0, xTicks[xTicks.length - 1]]}
                  ticks={xTicks}
                  tick={{ fill: '#748195', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    value.toLocaleString('en-US')
                  }
                  tickLine={false}
                  axisLine={{ stroke: '#dce4ee' }}
                  tickMargin={10}
                  height={52}
                  label={{
                    value: 'Speed (pass/min)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: '#526176',
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="costEfficiency"
                  name="Cost efficiency"
                  domain={[0, yTicks[yTicks.length - 1]]}
                  ticks={yTicks}
                  tick={{ fill: '#748195', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    value.toLocaleString('en-US', {
                      notation: 'compact',
                      maximumSignificantDigits: 3,
                    })
                  }
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                  width={58}
                />
                <ZAxis dataKey={() => 1} range={[200, 200]} />
                <Tooltip
                  cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const point = active
                      ? points.find(
                          ({ model }) => model === payload?.[0]?.payload.model,
                        )
                      : undefined;
                    return point ? (
                      <div className="performance-tooltip">
                        <strong>{point.model}</strong>
                        <dl>
                          <div>
                            <dt>Speed</dt>
                            <dd>
                              {point.speed.toLocaleString('en-US', {
                                maximumFractionDigits: 3,
                              })}{' '}
                              <span>pass/min</span>
                            </dd>
                          </div>
                          <div>
                            <dt>Cost efficiency</dt>
                            <dd>
                              {point.costEfficiency.toLocaleString('en-US', {
                                maximumFractionDigits: 3,
                              })}{' '}
                              <span>pass/$</span>
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ) : null;
                  }}
                />
                <Scatter
                  name="Models"
                  dataKey="costEfficiency"
                  data={visiblePoints}
                  stroke="#fff"
                  strokeWidth={2}
                  isAnimationActive={false}
                  activeShape={{
                    stroke: '#94a3b8',
                    strokeOpacity: 0.2,
                    strokeWidth: 10,
                  }}
                  onMouseEnter={(point) =>
                    setHighlightedModel(point.payload.model)
                  }
                  onMouseLeave={() => setHighlightedModel(null)}
                  className="performance-series"
                >
                  {visiblePoints.map((point) => (
                    <Cell
                      key={point.model}
                      fill={colors[points.indexOf(point) % colors.length]}
                      opacity={
                        highlightedModel && highlightedModel !== point.model
                          ? 0.25
                          : 1
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="model"
                    position="top"
                    offset={14}
                    fill="#526176"
                    fontSize={12}
                    fontWeight={600}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {!visiblePoints.length && (
              <p className="performance-hidden-message">
                All models are hidden. Select a model below to show it.
              </p>
            )}
          </div>
          <ul className="model-performance-legend">
            {points.map(({ model, speed, costEfficiency }, index) => (
              <li key={model}>
                <button
                  type="button"
                  aria-pressed={!hiddenModels.includes(model)}
                  aria-label={`${hiddenModels.includes(model) ? 'Show' : 'Hide'} ${model} on chart`}
                  onClick={() => {
                    setHiddenModels((models) =>
                      models.includes(model)
                        ? models.filter((name) => name !== model)
                        : [...models, model],
                    );
                    setHighlightedModel(null);
                  }}
                  onMouseEnter={() =>
                    setHighlightedModel(
                      hiddenModels.includes(model) ? null : model,
                    )
                  }
                  onMouseLeave={() => setHighlightedModel(null)}
                  onFocus={() =>
                    setHighlightedModel(
                      hiddenModels.includes(model) ? null : model,
                    )
                  }
                  onBlur={() => setHighlightedModel(null)}
                >
                  <span
                    className="performance-swatch"
                    style={{ background: colors[index % colors.length] }}
                    aria-hidden="true"
                  />
                  <strong>{model}</strong>
                  <span className="performance-values">
                    {speed.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    pass/min
                    <span>·</span>
                    {costEfficiency.toLocaleString('en-US', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    pass/$
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="list-empty">
          No models have valid duration and cost estimates.
        </p>
      )}
      <div className="model-performance-note">
        <p>
          Speed = pass rate ÷ average estimated duration (minutes). Cost
          efficiency = pass rate ÷ average estimated cost (USD). Averages are
          geometric means.
        </p>
        <p>
          Speed estimates how many test cases a model can pass in one minute.
          Cost efficiency estimates how many it can pass for every $1 spent.
          Farther right means faster; higher up means better value for money.
        </p>
        {modelCount > points.length && (
          <p>
            {modelCount - points.length} of {modelCount} models omitted because
            duration or cost estimates are unavailable.
          </p>
        )}
      </div>
    </section>
  );
}
