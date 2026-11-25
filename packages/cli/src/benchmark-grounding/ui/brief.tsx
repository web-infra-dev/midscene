import { StrictMode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReportChart } from '../core/overview';
import type { BriefData } from '../core/reporter';
import { useHelpPopoverPosition } from './components/MetricHelp';
import {
  MatchingModelsContext,
  type ScatterLinkProps,
  ScatterPlot,
  type ScatterViewport,
} from './components/ScatterPlot';
import './base.css';
import './brief.css';

function BriefScatterLink({ href, ...props }: ScatterLinkProps) {
  return (
    <a
      {...props}
      href={`./index.html#${href}`}
      target="_blank"
      rel="noreferrer"
    />
  );
}

function GroundingBriefChart({
  scatter,
  firstTestcase,
}: {
  scatter: ReportChart['scatter'];
  firstTestcase?: string;
}) {
  useHelpPopoverPosition();
  const viewportRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<ScatterViewport>();
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const resize = ({ width, height }: DOMRectReadOnly) => {
      if (width <= 0 || height <= 0) return;
      setViewport((previous) =>
        previous?.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    // Measure the viewport, never the transformed chart inside it.
    resize(element.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => {
      if (entry) resize(entry.contentRect);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const matchingModels = useMemo(
    () => new Set(scatter.points.map(({ model }) => model)),
    [scatter.points],
  );
  return (
    <main className="model-scatter-brief" ref={viewportRef}>
      <MatchingModelsContext.Provider value={matchingModels}>
        {viewport && (
          <ScatterPlot
            scatter={scatter}
            firstTestcase={firstTestcase}
            LinkComponent={BriefScatterLink}
            viewport={viewport}
          />
        )}
      </MatchingModelsContext.Provider>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing benchmark root element');

try {
  const embedded = document.getElementById('benchmark-data');
  if (!embedded?.textContent)
    throw new Error('Missing embedded benchmark data');
  const data = JSON.parse(embedded.textContent) as BriefData;
  if (data.mode !== 'brief' || !data.scatter)
    throw new Error('Invalid embedded benchmark data');
  document.title = `Midscene Grounding Benchmark - Evaluation ${data.evaluationId}`;
  createRoot(root).render(
    <StrictMode>
      <GroundingBriefChart
        scatter={data.scatter}
        firstTestcase={data.firstTestcase}
      />
    </StrictMode>,
  );
} catch (error) {
  root.setAttribute('role', 'alert');
  root.className = 'app-error';
  root.textContent = `Unable to open benchmark: ${error instanceof Error ? error.message : String(error)}`;
}
