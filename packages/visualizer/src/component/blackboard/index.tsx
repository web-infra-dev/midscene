'use client';
import 'pixi.js/unsafe-eval';
import type { BaseElement, Rect, UIContext } from '@midscene/core';
import { Checkbox } from 'antd';
import type { CheckboxProps } from 'antd';
import * as PIXI from 'pixi.js';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { colorForName, highlightColorForType } from '../../utils/color';
import './index.less';
import { treeToList } from '@midscene/shared/extractor';
import { DropShadowFilter, GlowFilter } from 'pixi-filters';
import { useGlobalPreference } from '../../store/store';

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
  uiContext: UIContext | undefined | null;
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

  // Handle undefined/null uiContext
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

  // Extract base64 string from screenshot
  // After restoreImageReferences(), screenshot is { base64: string }
  const screenshotBase64 = useMemo(() => {
    if (!screenshot) return '';
    if (typeof screenshot === 'object' && 'base64' in screenshot) {
      return (screenshot as { base64: string }).base64;
    }
    if (typeof screenshot === 'string') return screenshot;
    return '';
  }, [screenshot]);

  const screenWidth = shotSize.width;
  const screenHeight = shotSize.height;

  const domRef = useRef<HTMLDivElement>(null); // Should be HTMLDivElement not HTMLInputElement
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);
  const [appInitialed, setAppInitialed] = useState(false);

  const highlightContainer = useMemo(() => new PIXI.Container(), []);
  const elementMarkContainer = useMemo(() => new PIXI.Container(), []);

  const [hoverElement, setHoverElement] = useState<BaseElement | null>(null);

  // key overlays
  const pixiBgRef = useRef<PIXI.Sprite | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const highlightGraphicsRef = useRef<PIXI.Graphics[]>([]);
  const glowFiltersRef = useRef<GlowFilter[]>([]);
  // const {
  //   backgroundVisible,
  //   setBackgroundVisible,
  //   elementsVisible,
  //   setElementsVisible,
  // } = useGlobalPreference();
  const backgroundVisible = true;
  const elementsVisible = true;

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
      // Stop animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
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
      backgroundSprite.visible = backgroundVisible;
    };
    img.onerror = (e) => {
      console.error('load screenshot failed', e);
    };

    if (screenshotBase64) {
      img.src = screenshotBase64;
    } else {
      console.error('screenshotBase64 is empty, cannot load image');
    }
  }, [app.stage, appInitialed, screenWidth, screenHeight, screenshotBase64]);

  const { highlightElementRects } = useMemo(() => {
    const highlightElementRects: Rect[] = [];

    highlightContainer.removeChildren();
    elementMarkContainer.removeChildren();

    // Make containers interactive but not blocking events
    highlightContainer.eventMode = 'passive';
    elementMarkContainer.eventMode = 'passive';

    // Clear previous highlight graphics references
    highlightGraphicsRef.current = [];
    glowFiltersRef.current = [];

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
        const items = rectMarkForItem(rect, content, 'highlight');
        const graphics = items[0] as PIXI.Graphics; // First element is always Graphics

        // Add glow filter for prominent highlight effect
        const glowFilter = new GlowFilter({
          distance: 30,
          outerStrength: 3,
          innerStrength: 0,
          color: 0xfd5907, // Orange color
          quality: 0.5,
        });

        // Add both drop shadow and glow filters
        const existingFilters = graphics.filters;
        if (Array.isArray(existingFilters)) {
          graphics.filters = [...existingFilters, glowFilter];
        } else if (existingFilters) {
          graphics.filters = [existingFilters, glowFilter];
        } else {
          graphics.filters = [glowFilter];
        }

        items.forEach((item) => highlightContainer.addChild(item));
        // Store references for animation
        highlightGraphicsRef.current.push(graphics);
        glowFiltersRef.current.push(glowFilter);
      });
    }

    if (highlightPoints?.length) {
      highlightPoints.forEach((point) => {
        const graphics = pointMarkForItem(point, 'highlightPoint');

        // Add glow filter for points too
        const glowFilter = new GlowFilter({
          distance: 25,
          outerStrength: 2.5,
          innerStrength: 0,
          color: 0xfd5907,
          quality: 0.5,
        });

        graphics.filters = [glowFilter];

        highlightContainer.addChild(graphics);
        // Store references for animation
        highlightGraphicsRef.current.push(graphics);
        glowFiltersRef.current.push(glowFilter);
      });
    }

    // element rects
    // const elements = [];
    // elements.forEach((element) => {
    //   const { rect, content, id } = element;
    //   const ifHighlight = highlightIds.includes(id) || hoverElement?.id === id;

    //   if (ifHighlight) {
    //     return;
    //   }

    //   const [graphics] = rectMarkForItem(rect, content, 'element');
    //   elementMarkContainer.addChild(graphics);
    // });

    elementMarkContainer.visible = elementsVisible;
    return {
      highlightElementRects,
    };
  }, [
    app,
    appInitialed,
    highlightElements,
    hoverElement,
    highlightRect,
    highlightPoints,
    // bgVisible,
    // elementsVisible,
  ]);

  // Pulsing animation for highlight elements
  useEffect(() => {
    if (!appInitialed || highlightGraphicsRef.current.length === 0) {
      console.log('Animation skipped:', {
        appInitialed,
        graphicsCount: highlightGraphicsRef.current.length,
      });
      return;
    }

    console.log(
      'Starting pulsing animation for',
      highlightGraphicsRef.current.length,
      'graphics',
    );
    const graphicsToAnimate = highlightGraphicsRef.current;
    const glowFilters = glowFiltersRef.current;
    const pulseDuration = 1200; // 1.2 seconds for smooth pulsing
    const minAlpha = 0.4;
    const maxAlpha = 1.0;
    const minGlowStrength = 2.0;
    const maxGlowStrength = 5.0;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = (elapsed % pulseDuration) / pulseDuration;

      // Use sine wave for smooth pulsing effect
      const sineValue = Math.sin(progress * Math.PI * 2);
      const normalizedSine = (sineValue + 1) / 2; // 0 to 1

      const alpha = minAlpha + normalizedSine * (maxAlpha - minAlpha);
      const glowStrength =
        minGlowStrength + normalizedSine * (maxGlowStrength - minGlowStrength);

      graphicsToAnimate.forEach((graphics, index) => {
        graphics.alpha = alpha;

        // Animate glow strength
        if (glowFilters[index]) {
          glowFilters[index].outerStrength = glowStrength;
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      console.log('Stopping pulsing animation');
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [appInitialed, highlightElements, highlightPoints]);

  // const onSetBackgroundVisible: CheckboxProps['onChange'] = (e) => {
  //   setBackgroundVisible(e.target.checked);
  //   if (pixiBgRef.current) {
  //     pixiBgRef.current.visible = e.target.checked;
  //   }
  // };

  // const onSetElementsVisible: CheckboxProps['onChange'] = (e) => {
  //   setElementsVisible(e.target.checked);
  //   elementMarkContainer.visible = e.target.checked;
  // };

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
      {/* <div
        className="blackboard-filter"
        style={{ display: props.hideController ? 'none' : 'block' }}
      >
        <div className="overlay-control">
          <Checkbox
            checked={backgroundVisible}
            onChange={onSetBackgroundVisible}
          >
            Background
          </Checkbox>
          <Checkbox checked={elementsVisible} onChange={onSetElementsVisible}>
            Elements
          </Checkbox>
        </div>
      </div> */}
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
