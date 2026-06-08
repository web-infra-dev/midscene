'use client';
import type { BaseElement, Rect, UIContext } from '@midscene/core';
import React, { type ReactElement } from 'react';
import { getCenterHighlightBox } from '../../utils/highlight-element';
import { ClickReticle } from '../click-reticle';
import { normalizeBlackboardHighlights } from './highlights';
import './index.less';

export const Blackboard = (props: {
  uiContext: UIContext | undefined | null;
  highlightElements?: BaseElement[];
  highlightRect?: Rect;
  hideController?: boolean;
}) => {
  const highlightElements: BaseElement[] = props.highlightElements || [];
  const highlightRect = props.highlightRect;

  const shotSize = props.uiContext?.shotSize;

  if (!shotSize) {
    return (
      <div className="blackboard">
        <div className="blackboard-main-content" style={{ padding: '20px' }}>
          No UI context available
        </div>
      </div>
    );
  }

  const context = props.uiContext;
  const screenWidth = shotSize.width;
  const screenHeight = shotSize.height;

  const highlightOverlays = React.useMemo(
    () => normalizeBlackboardHighlights(highlightElements),
    [highlightElements],
  );

  const screenshotBase64 = React.useMemo(() => {
    return context?.screenshot?.base64 || '';
  }, [context]);

  const highlightBoxes = highlightOverlays.map((highlight) =>
    getCenterHighlightBox(highlight),
  );

  let bottomTipA: ReactElement | null = null;
  if (highlightBoxes.length === 1) {
    bottomTipA = (
      <div className="bottom-tip">
        <div className="bottom-tip-item">
          Element: {JSON.stringify(highlightBoxes[0])}
        </div>
      </div>
    );
  } else if (highlightBoxes.length > 1) {
    bottomTipA = (
      <div className="bottom-tip">
        <div className="bottom-tip-item">
          Element: {JSON.stringify(highlightBoxes)}
        </div>
      </div>
    );
  }

  return (
    <div className="blackboard">
      <div
        className="blackboard-main-content"
        style={{
          width: 'fit-content',
          maxWidth: '100%',
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
          {highlightOverlays.map((el) => {
            const highlightBox = getCenterHighlightBox(el);

            return (
              <div
                key={`${el.key}-rect`}
                className="blackboard-rect blackboard-rect-highlight"
                style={{
                  left: `${(highlightBox.left / screenWidth) * 100}%`,
                  top: `${(highlightBox.top / screenHeight) * 100}%`,
                  width: `${(highlightBox.width / screenWidth) * 100}%`,
                  height: `${(highlightBox.height / screenHeight) * 100}%`,
                }}
              >
                <ClickReticle
                  scale="var(--ui-scale, 1)"
                  style={{ left: '50%', top: '50%' }}
                />
              </div>
            );
          })}
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
