'use client';
import type { BaseElement, Rect, UIContext } from '@midscene/core';
import type { ReactElement } from 'react';
import { useMemo, useRef } from 'react';
import { colorForName, highlightColorForType } from '../../utils/color';
import './index.less';

export const Blackboard = (props: {
  uiContext: UIContext | undefined | null;
  highlightElements?: BaseElement[];
  highlightRect?: Rect;
  highlightPoints?: [number, number][];
  hideController?: boolean;
  onCanvasClick?: (position: [number, number]) => void;
}) => {
  const highlightElements: BaseElement[] = props.highlightElements || [];
  const highlightRect = props.highlightRect;
  const highlightPoints = props.highlightPoints;

  if (!props.uiContext?.size) {
    return (
      <div className="blackboard">
        <div className="blackboard-main-content" style={{ padding: '20px' }}>
          No UI context available
        </div>
      </div>
    );
  }

  const context = props.uiContext;
  const { size, screenshot } = context;
  const screenWidth = size.width;
  const screenHeight = size.height;

  const screenshotBase64 = useMemo(() => {
    if (!screenshot) return '';
    if (typeof screenshot === 'object' && 'base64' in screenshot) {
      return (screenshot as { base64: string }).base64;
    }
    if (typeof screenshot === 'string') return screenshot;
    return '';
  }, [screenshot]);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!props.onCanvasClick || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = screenWidth / rect.width;
    const scaleY = screenHeight / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    props.onCanvasClick([x, y]);
  };

  const highlightElementRects: Rect[] = highlightElements.map((e) => e.rect);

  let bottomTipA: ReactElement | null = null;
  if (highlightElementRects.length === 1) {
    bottomTipA = (
      <div className="bottom-tip">
        <div className="bottom-tip-item">
          Element: {JSON.stringify(highlightElementRects[0])}
        </div>
      </div>
    );
  } else if (highlightElementRects.length > 1) {
    bottomTipA = (
      <div className="bottom-tip">
        <div className="bottom-tip-item">
          Element: {JSON.stringify(highlightElementRects)}
        </div>
      </div>
    );
  }

  return (
    <div className="blackboard">
      <div
        className="blackboard-main-content"
        ref={containerRef}
        onClick={handleClick}
        style={{
          width: '100%',
          position: 'relative',
          cursor: props.onCanvasClick ? 'crosshair' : undefined,
        }}
      >
        {screenshotBase64 && (
          <img
            src={screenshotBase64}
            alt="screenshot"
            className="blackboard-screenshot"
            draggable={false}
          />
        )}

        {/* Overlay container — scaled to match image coordinates */}
        <div
          className="blackboard-overlay"
          style={{ aspectRatio: `${screenWidth}/${screenHeight}` }}
        >
          {/* Search area */}
          {highlightRect && (
            <div
              className="blackboard-rect blackboard-rect-search"
              style={{
                left: `${(highlightRect.left / screenWidth) * 100}%`,
                top: `${(highlightRect.top / screenHeight) * 100}%`,
                width: `${(highlightRect.width / screenWidth) * 100}%`,
                height: `${(highlightRect.height / screenHeight) * 100}%`,
              }}
            >
              <span className="blackboard-rect-label">Search Area</span>
            </div>
          )}

          {/* Highlight elements */}
          {highlightElements.map((el, idx) => (
            <div
              key={el.id || idx}
              className="blackboard-rect blackboard-rect-highlight"
              style={{
                left: `${(el.rect.left / screenWidth) * 100}%`,
                top: `${(el.rect.top / screenHeight) * 100}%`,
                width: `${(el.rect.width / screenWidth) * 100}%`,
                height: `${(el.rect.height / screenHeight) * 100}%`,
              }}
            >
              {el.content && (
                <span className="blackboard-rect-label">{el.content}</span>
              )}
            </div>
          ))}

          {/* Highlight points */}
          {highlightPoints?.map((point, idx) => (
            <div
              key={idx}
              className="blackboard-point"
              style={{
                left: `${(point[0] / screenWidth) * 100}%`,
                top: `${(point[1] / screenHeight) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div
        className="bottom-tip"
        style={{ display: props.hideController ? 'none' : 'block' }}
      >
        {bottomTipA}
      </div>
    </div>
  );
};

export default Blackboard;
