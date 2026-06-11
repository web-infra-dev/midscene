import { useMemo } from 'react';
import { useExploreModel } from './useExploreModel';

export default function App() {
  const model = useExploreModel();
  const featureNames = useMemo(
    () => model.features.map((feature) => feature.name),
    [model.features],
  );

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <h1>midscene-bdd dashboard</h1>
        <p>React scaffold (wave 1) for the ExploreModel viewer.</p>
      </header>

      <section className="stats-grid" aria-label="dashboard stats">
        <article>
          <h2>Features</h2>
          <strong>{model.stats.features}</strong>
        </article>
        <article>
          <h2>Scenarios</h2>
          <strong>{model.stats.scenarios}</strong>
        </article>
        <article>
          <h2>Flows</h2>
          <strong>{model.stats.flows}</strong>
        </article>
        <article>
          <h2>Steps</h2>
          <strong>{model.stats.steps}</strong>
        </article>
      </section>

      <section className="feature-list">
        <h2>Feature Names</h2>
        <ul>
          {featureNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
