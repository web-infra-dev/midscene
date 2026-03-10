'use client';
import type { BaseElement, Rect, UIContext } from '@midscene/core';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import './index.less';

export const Blackboard = (props: {
  uiContext: UIContext | undefined | null;
  highlightElements?: BaseElement[];
  highlightRect?: Rect;
  hideController?: boolean;
}) => {
  const highlightElements: BaseElement[] = props.highlightElements || [];
  const highlightRect = props.highlightRect;

  if (!props.uiContext?.shotSize) {
    return (
      <div className="blackboard">
        <div className="blackboard-main-content" style={{ padding: '20px' }}>
          No UI context available
        </div>
      </div>
    );
  }

  const context = props.uiContext;
  const { shotSize, screenshot } = context;
  const screenWidth = shotSize.width;
  const screenHeight = shotSize.height;

  const screenshotBase64 = useMemo(() => {
    if (!screenshot) return '';
    if (typeof screenshot === 'object' && 'base64' in screenshot) {
      return (screenshot as { base64: string }).base64;
    }
    if (typeof screenshot === 'string') return screenshot;
    return '';
  }, [screenshot]);

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
        style={{
          width: '100%',
          position: 'relative',
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
          style={
            {
              aspectRatio: `${screenWidth}/${screenHeight}`,
              '--ui-scale': Math.max(1, Math.sqrt(screenWidth / 1920)),
            } as React.CSSProperties
          }
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
