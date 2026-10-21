import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';
import type { TestcaseView } from '../types';

interface Dimensions {
  width: number;
  height: number;
}

interface ScreenshotPanelProps {
  testcase: TestcaseView;
  zoom: 'fit' | 'actual';
  onZoomChange: (zoom: 'fit' | 'actual') => void;
  showGT: boolean;
  onShowGTChange: (value: boolean) => void;
}

function originalImageUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      url.pathname.startsWith('/images/')
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function ScreenshotPanel({
  testcase,
  zoom,
  onZoomChange,
  showGT,
  onShowGTChange,
}: ScreenshotPanelProps) {
  const viewportRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [viewportSize, setViewportSize] = useState<Dimensions>({
    width: 0,
    height: 0,
  });
  const [imageError, setImageError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const imageUrl = useMemo(
    () => originalImageUrl(testcase.imageUrl),
    [testcase.imageUrl],
  );
  const error = imageUrl ? imageError : '图片地址无效，无法加载原始截图。';
  const loaded = dimensions !== null && error === null;
  const refusal = testcase.groundTruth === 'REFUSAL';
  const coordinateText =
    testcase.groundTruth === 'REFUSAL'
      ? 'REFUSAL'
      : `[${testcase.groundTruth.map((value) => value.toFixed(1)).join(', ')}]`;

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
  let groundTruthStyle: CSSProperties | undefined;
  if (dimensions && testcase.groundTruth !== 'REFUSAL') {
    const [top, right, bottom, left] = testcase.groundTruth;
    groundTruthStyle = {
      top: `${(top / dimensions.height) * 100}%`,
      left: `${(left / dimensions.width) * 100}%`,
      width: `${((right - left) / dimensions.width) * 100}%`,
      height: `${((bottom - top) / dimensions.height) * 100}%`,
    };
  }

  function onImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    if (image !== imageRef.current) return;
    if (!image.naturalWidth || !image.naturalHeight) {
      setImageError('原图加载失败，请重试。');
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
  }

  function retryImage() {
    setDimensions(null);
    setImageError(null);
    setAttempt((previous) => previous + 1);
  }

  return (
    <section className="image-panel" aria-label="原始截图与 Ground Truth">
      <section className="image-toolbar" aria-label="截图工具">
        <div className="image-caption">
          <strong>原始截图</strong>
          <span id="image-dimensions" className="image-dimensions">
            {error
              ? '加载失败'
              : dimensions
                ? `${dimensions.width} × ${dimensions.height} px`
                : '加载中…'}
          </span>
        </div>
        <div className="image-actions">
          <label className="gt-toggle" title="在截图上显示 Ground Truth 边界框">
            <input
              id="show-gt"
              type="checkbox"
              checked={showGT}
              disabled={refusal}
              onChange={(event) => onShowGTChange(event.target.checked)}
            />
            <span>显示 Ground Truth</span>
          </label>
          <section className="zoom-controls" aria-label="截图缩放">
            <button
              id="zoom-fit"
              type="button"
              aria-pressed={zoom === 'fit'}
              title="完整显示截图"
              onClick={() => onZoomChange('fit')}
            >
              适应
            </button>
            <button
              id="zoom-actual"
              type="button"
              aria-pressed={zoom === 'actual'}
              title="按原始像素显示截图"
              onClick={() => onZoomChange('actual')}
            >
              100%
            </button>
          </section>
          <a
            id="open-image"
            className="open-image"
            href={imageUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页打开原图"
          >
            原图 ↗
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
          <span id="image-state-message">{error ?? '正在加载原图…'}</span>
          <button
            id="retry-image"
            className="button"
            type="button"
            hidden={!error}
            onClick={retryImage}
          >
            重试图片
          </button>
        </output>
        <section
          id="image-viewport"
          className="image-viewport"
          ref={viewportRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the original image.
          tabIndex={0}
          data-zoom={zoom}
          aria-label="截图，可在 100% 模式下滚动查看"
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
              {imageUrl && (
                <img
                  key={`${imageUrl}:${attempt}`}
                  ref={imageRef}
                  className="screenshot"
                  src={imageUrl}
                  alt={`${testcase.name} 原始截图`}
                  draggable={false}
                  onLoad={onImageLoad}
                  onError={(event) => {
                    if (event.currentTarget === imageRef.current) {
                      setImageError('原图加载失败，请重试。');
                    }
                  }}
                />
              )}
              {groundTruthStyle && (
                <div
                  className="gt-box"
                  aria-label="Ground Truth 边界框"
                  style={groundTruthStyle}
                  hidden={!showGT}
                >
                  <span className="gt-box-label" aria-hidden="true">
                    GT
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      <div className="image-footer">
        <span id="image-ground-truth">
          {refusal ? 'REFUSAL · 无目标框' : `GT ${coordinateText}`}
        </span>
        <span id="zoom-value">
          {loaded ? `${Math.round(scale * 100)}%` : ''}
        </span>
      </div>
    </section>
  );
}
