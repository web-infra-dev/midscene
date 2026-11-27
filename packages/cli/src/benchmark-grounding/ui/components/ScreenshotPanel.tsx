import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EvaluationResult, TestcaseView } from '../types';

export function ScreenshotPanel({
  testcase,
  zoom,
  onZoomChange,
  showGT,
  onShowGTChange,
  result,
  showPrediction,
  onShowPredictionChange,
}: {
  testcase: TestcaseView;
  zoom: 'fit' | 'actual';
  onZoomChange: (zoom: 'fit' | 'actual') => void;
  showGT: boolean;
  onShowGTChange: (value: boolean) => void;
  result?: EvaluationResult;
  showPrediction: boolean;
  onShowPredictionChange: (value: boolean) => void;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });
  const [error, setImageError] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState('');
  useEffect(() => {
    if (!testcase.image.startsWith('data:')) {
      setOriginalImageUrl(testcase.image);
      return;
    }
    // A blob URL lets browsers open an embedded original image in a new tab.
    const separator = testcase.image.indexOf(',');
    const bytes = Uint8Array.from(
      atob(testcase.image.slice(separator + 1)),
      (value) => value.charCodeAt(0),
    );
    const mime = testcase.image.slice(5, testcase.image.indexOf(';'));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    setOriginalImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [testcase.image]);
  const loaded = dimensions !== null && error === null;
  const groundTruth = testcase.groundTruth;
  const refusal = groundTruth === 'REFUSAL';
  const prediction =
    result?.output.type === 'POINT' ? result.output : undefined;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !loaded) return;
    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      setViewportSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loaded]);

  const scale = dimensions
    ? zoom === 'actual'
      ? 1
      : Math.min(
          1,
          Math.max(1, viewportSize.width - 48) / dimensions.width,
          Math.max(1, viewportSize.height - 48) / dimensions.height,
        )
    : 1;
  const groundTruthStyle = (() => {
    if (!dimensions || groundTruth === 'REFUSAL') return undefined;
    const [top, right, bottom, left] = groundTruth;
    return {
      top: `${(top / dimensions.height) * 100}%`,
      left: `${(left / dimensions.width) * 100}%`,
      width: `${((right - left) / dimensions.width) * 100}%`,
      height: `${((bottom - top) / dimensions.height) * 100}%`,
    };
  })();
  const predictionBoxStyle =
    dimensions && prediction?.rect
      ? {
          top: `${(prediction.rect.top / dimensions.height) * 100}%`,
          left: `${(prediction.rect.left / dimensions.width) * 100}%`,
          width: `${(prediction.rect.width / dimensions.width) * 100}%`,
          height: `${(prediction.rect.height / dimensions.height) * 100}%`,
        }
      : undefined;
  const predictionPointStyle =
    dimensions && prediction?.center
      ? {
          left: `${(prediction.center[0] / dimensions.width) * 100}%`,
          top: `${(prediction.center[1] / dimensions.height) * 100}%`,
        }
      : undefined;

  return (
    <section
      className="image-panel"
      aria-label="Screenshot, Ground Truth, and Prediction"
    >
      <section className="image-toolbar" aria-label="Screenshot Controls">
        <div className="image-caption">
          <strong>Screenshot</strong>
          <span id="image-dimensions" className="image-dimensions">
            {error
              ? 'Failed to load'
              : dimensions
                ? `${dimensions.width} × ${dimensions.height} px`
                : 'Loading…'}
          </span>
        </div>
        <div className="image-actions">
          <label
            className="gt-toggle"
            title="Show the ground truth box on the screenshot"
          >
            <input
              id="show-gt"
              type="checkbox"
              checked={showGT}
              disabled={refusal}
              onChange={(event) => onShowGTChange(event.target.checked)}
            />
            <span>Show ground truth</span>
          </label>
          {result && (
            <label
              className="gt-toggle"
              title="Show the prediction on the screenshot"
            >
              <input
                id="show-prediction"
                type="checkbox"
                checked={showPrediction}
                disabled={!prediction?.center && !prediction?.rect}
                onChange={(event) =>
                  onShowPredictionChange(event.target.checked)
                }
              />
              <span>Show prediction</span>
            </label>
          )}
          <section className="zoom-controls" aria-label="Screenshot Zoom">
            <button
              id="zoom-fit"
              type="button"
              aria-pressed={zoom === 'fit'}
              title="Fit the entire screenshot in view"
              onClick={() => onZoomChange('fit')}
            >
              Fit
            </button>
            <button
              id="zoom-actual"
              type="button"
              aria-pressed={zoom === 'actual'}
              title="Show the screenshot at its original size"
              onClick={() => onZoomChange('actual')}
            >
              100%
            </button>
          </section>
          <a
            id="open-image"
            className="open-image"
            href={originalImageUrl || testcase.image}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the original image in a new tab"
          >
            Original image ↗
          </a>
        </div>
      </section>
      <div className="image-area">
        <output
          id="image-state"
          className="image-state"
          aria-live="polite"
          hidden={loaded}
        >
          <span id="image-state-message">{error ?? 'Loading screenshot…'}</span>
        </output>
        <section
          id="image-viewport"
          className="image-viewport"
          ref={viewportRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the original image.
          tabIndex={0}
          data-zoom={zoom}
          aria-label="Screenshot; scroll to explore at 100% zoom"
          hidden={!loaded}
        >
          <div className="image-centering">
            <div
              id="image-canvas"
              className="image-canvas"
              style={
                dimensions
                  ? {
                      width: dimensions.width * scale,
                      height: dimensions.height * scale,
                    }
                  : undefined
              }
            >
              <img
                className="screenshot"
                src={testcase.image}
                alt={`Screenshot for ${testcase.name}`}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (!image.naturalWidth || !image.naturalHeight) {
                    setImageError(
                      'Failed to load the screenshot. Reload this page to try again.',
                    );
                    return;
                  }
                  setDimensions({
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                  if (viewportRef.current) {
                    viewportRef.current.scrollTop = 0;
                    viewportRef.current.scrollLeft = 0;
                  }
                }}
                onError={() =>
                  setImageError(
                    'Failed to load the screenshot. Reload this page to try again.',
                  )
                }
              />
              {groundTruthStyle && (
                <div
                  className="gt-box"
                  aria-label="Ground Truth Box"
                  style={groundTruthStyle}
                  hidden={!showGT}
                >
                  <span className="gt-box-label" aria-hidden="true">
                    GT
                  </span>
                </div>
              )}
              {predictionBoxStyle && (
                <div
                  className="prediction-box"
                  aria-label="Prediction Box"
                  style={predictionBoxStyle}
                  hidden={!showPrediction}
                >
                  <span className="prediction-box-label" aria-hidden="true">
                    Prediction
                  </span>
                </div>
              )}
              {predictionPointStyle && (
                <div
                  className="prediction-point"
                  aria-label="Prediction Coordinates"
                  title={`Prediction Coordinates [${prediction?.center?.join(', ')}]`}
                  style={predictionPointStyle}
                  hidden={!showPrediction}
                />
              )}
            </div>
          </div>
        </section>
      </div>
      <div className="image-footer">
        <span id="image-ground-truth">
          {result ? 'Evaluation snapshot · ' : ''}
          {refusal
            ? 'Refusal · No target box'
            : `Ground truth [${groundTruth.map((value) => value.toFixed(1)).join(', ')}]`}
        </span>
        <span id="zoom-value">
          {loaded ? `${Math.round(scale * 100)}%` : ''}
        </span>
      </div>
    </section>
  );
}
