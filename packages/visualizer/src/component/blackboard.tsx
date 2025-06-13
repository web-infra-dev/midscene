'use client';
import 'pixi.js/unsafe-eval';
import { Checkbox } from 'antd';
import type { CheckboxProps } from 'antd';
import * as PIXI from 'pixi.js';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import type { BaseElement, Rect, UIContext } from '../../../core';
import { colorForName, highlightColorForType } from './color';
import './blackboard.less';
import { treeToList } from '@midscene/shared/extractor';
import { DropShadowFilter } from 'pixi-filters';
import { useBlackboardPreference } from './store/store';

const itemFillAlpha = 0.4;
const highlightAlpha = 0.4;
const pointRadius = 10;

export const pointMarkForItem = (
  point: [number, number],
  type: 'highlightPoint',
) => {
  const [x, y] = point;
  const themeColor = highlightColorForType('element');

  const graphics = new PIXI.Graphics();
  // draw a circle
  graphics.beginFill(themeColor, itemFillAlpha);
  graphics.drawCircle(x, y, pointRadius);
  graphics.endFill();
  return graphics;
};

export const rectMarkForItem = (
  rect: Rect,
  name: string,
  type: 'element' | 'searchArea' | 'highlight',
) => {
  const { left, top, width, height } = rect;
  let themeColor: string;
  if (type === 'element') {
    themeColor = colorForName(name);
  } else if (type === 'searchArea') {
    themeColor = highlightColorForType('searchArea');
  } else {
    themeColor = highlightColorForType('element');
  }

  const alpha = type === 'highlight' ? highlightAlpha : itemFillAlpha;
  const graphics = new PIXI.Graphics();
  graphics.beginFill(themeColor, alpha);
  graphics.lineStyle(1, themeColor, 1);
  graphics.drawRect(left, top, width, height);
  graphics.endFill();

  const dropShadowFilter = new DropShadowFilter({
    blur: 2,
    quality: 3,
    alpha: 0.4,
    offset: { x: 4, y: 4 },
    color: 0x333333,
  });

  graphics.filters = [dropShadowFilter];

  const nameFontSize = 18;
  if (!name) {
    return [graphics];
  }
  const texts = new PIXI.Text(name, {
    fontSize: nameFontSize,
    fill: 0x0,
  });
  texts.x = left;
  texts.y = Math.max(top - (nameFontSize + 4), 0);
  return [graphics, texts];
};

export const Blackboard = (props: {
  uiContext: UIContext;
  highlightElements?: BaseElement[];
  highlightRect?: Rect;
  highlightPoints?: [number, number][];
  hideController?: boolean;
  onCanvasClick?: (position: [number, number]) => void;
}) => {
  const highlightElements: BaseElement[] = props.highlightElements || [];
  const highlightIds = highlightElements.map((e) => e.id);
  const highlightRect = props.highlightRect;
  const highlightPoints = props.highlightPoints;

  const context = props.uiContext!;
  const { size, screenshotBase64 } = context;

  const screenWidth = size.width;
  const screenHeight = size.height;

  const domRef = useRef<HTMLDivElement>(null); // Should be HTMLDivElement not HTMLInputElement
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);
  const [appInitialed, setAppInitialed] = useState(false);

  const highlightContainer = useMemo(() => new PIXI.Container(), []);
  const elementMarkContainer = useMemo(() => new PIXI.Container(), []);

  const [hoverElement, setHoverElement] = useState<BaseElement | null>(null);

  // key overlays
  const pixiBgRef = useRef<PIXI.Sprite | undefined>(undefined);
  const { markerVisible, setMarkerVisible, elementsVisible, setTextsVisible } =
    useBlackboardPreference();

  useEffect(() => {
    Promise.resolve(
      (async () => {
        if (!domRef.current || !screenWidth) {
          return;
        }
        await app.init({
          width: screenWidth,
          height: screenHeight,
          background: 0xffffff,
        });
        const canvasEl = domRef.current;
        domRef.current.appendChild(app.canvas); // Ensure app.view is appended
        const { clientWidth } = domRef.current.parentElement!;
        const targetHeight = window.innerHeight * 0.6;
        const viewportRatio = clientWidth / targetHeight;
        if (screenWidth / screenHeight <= viewportRatio) {
          const ratio = targetHeight / screenHeight;
          canvasEl.style.width = `${Math.floor(screenWidth * ratio)}px`;
          canvasEl.style.height = `${Math.floor(screenHeight * ratio)}px`;
        }

        app.stage.addChild(highlightContainer);
        app.stage.addChild(elementMarkContainer);

        setAppInitialed(true);
      })(),
    );

    // Clean up the PIXI application when the component unmounts
    return () => {
      console.log('will destroy');
      try {
        app.destroy(true, { children: true, texture: true });
      } catch (e) {
        console.warn('destroy failed', e);
      }
    };
  }, [app, screenWidth, screenHeight]);

  useEffect(() => {
    if (!appInitialed) {
      return;
    }

    // Enable interaction on the stage and all its children
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, screenWidth, screenHeight);

    const clickHandler = (event: PIXI.FederatedPointerEvent) => {
      console.log('pixi click', event);
      const { x, y } = event.data.global;
      props.onCanvasClick?.([Math.round(x), Math.round(y)]);
    };

    app.stage.on('click', clickHandler);

    return () => {
      app?.stage?.off('click');
    };
  }, [appInitialed, props.onCanvasClick, screenWidth, screenHeight]);

  // draw all texts on PIXI app
  useEffect(() => {
    if (!appInitialed) {
      return;
    }

    // draw the screenshot base64
    const img = new Image();
    img.onload = () => {
      if (!app.stage) return;
      const screenshotTexture = PIXI.Texture.from(img);
      const backgroundSprite = new PIXI.Sprite(screenshotTexture);
      backgroundSprite.x = 0;
      backgroundSprite.y = 0;
      backgroundSprite.width = screenWidth;
      backgroundSprite.height = screenHeight;

      // Ensure the background doesn't block interactivity
      backgroundSprite.eventMode = 'passive';

      app.stage.addChildAt(backgroundSprite, 0);
      pixiBgRef.current = backgroundSprite;
    };
    img.onerror = (e) => {
      console.error('load screenshot failed', e);
    };
    img.src = screenshotBase64;
  }, [app.stage, appInitialed, screenWidth, screenHeight]);

  const { highlightElementRects } = useMemo(() => {
    const highlightElementRects: Rect[] = [];

    highlightContainer.removeChildren();
    elementMarkContainer.removeChildren();

    // Make containers interactive but not blocking events
    highlightContainer.eventMode = 'passive';
    elementMarkContainer.eventMode = 'passive';

    if (highlightRect) {
      const [graphics] = rectMarkForItem(
        highlightRect,
        'Search Area',
        'searchArea',
      );
      highlightContainer.addChild(graphics);
    }

    if (highlightElements.length) {
      highlightElements.forEach((element) => {
        const { rect, content, id } = element;
        const [graphics] = rectMarkForItem(rect, content, 'highlight');
        highlightContainer.addChild(graphics);
      });
    }

    if (highlightPoints?.length) {
      highlightPoints.forEach((point) => {
        const graphics = pointMarkForItem(point, 'highlightPoint');
        highlightContainer.addChild(graphics);
      });
    }

    // element rects
    const elements = treeToList(context.tree);
    elements.forEach((element) => {
      const { rect, content, id } = element;
      const ifHighlight = highlightIds.includes(id) || hoverElement?.id === id;

      if (ifHighlight) {
        return;
      }

      const [graphics] = rectMarkForItem(rect, content, 'element');
      elementMarkContainer.addChild(graphics);
    });

    elementMarkContainer.visible = elementsVisible;
    return {
      highlightElementRects,
    };
  }, [
    app,
    appInitialed,
    highlightElements,
    context.tree,
    hoverElement,
    highlightRect,
    highlightPoints,
    // bgVisible,
    // elementsVisible,
  ]);

  const onSetMarkerVisible: CheckboxProps['onChange'] = (e) => {
    setMarkerVisible(e.target.checked);
    if (pixiBgRef.current) {
      pixiBgRef.current.visible = e.target.checked;
    }
  };

  const onSetElementsVisible: CheckboxProps['onChange'] = (e) => {
    setTextsVisible(e.target.checked);
    elementMarkContainer.visible = e.target.checked;
  };

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
        style={{ width: '100%' }}
        ref={domRef}
      />
      <div
        className="blackboard-filter"
        style={{ display: props.hideController ? 'none' : 'block' }}
      >
        <div className="overlay-control">
          <Checkbox checked={elementsVisible} onChange={onSetElementsVisible}>
            Elements
          </Checkbox>
        </div>
      </div>
      <div
        className="bottom-tip"
        style={{ display: props.hideController ? 'none' : 'block' }}
      >
        {bottomTipA}
      </div>

      {/* {footer} */}
    </div>
  );
};

export default Blackboard;
