'use client';
import { Checkbox } from 'antd';
import type { CheckboxProps } from 'antd';
import * as PIXI from 'pixi.js';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../../../midscene/dist/types';
import { colorForName, highlightColorForType } from './color';
import './blackboard.less';
import { useBlackboardPreference, useInsightDump } from './store';

const itemFillAlpha = 0.3;
const bgOnAlpha = 0.8;
const bgOffAlpha = 0.3;
const noop = () => {
  // noop
};

const BlackBoard = (): JSX.Element => {
  const dump = useInsightDump((store) => store.data);
  const setHighlightElements = useInsightDump(
    (store) => store.setHighlightElements,
  );
  const highlightSectionNames = useInsightDump(
    (store) => store.highlightSectionNames,
  );
  const highlightElements = useInsightDump((store) => store.highlightElements);
  const highlightIds = highlightElements.map((e) => e.id);

  const { context } = dump!;
  const { size, screenshotBase64 } = context;

  const screenWidth = size.width;
  const screenHeight = size.height;

  const domRef = useRef<HTMLDivElement>(null); // Should be HTMLDivElement not HTMLInputElement
  const app = useMemo<PIXI.Application>(() => new PIXI.Application(), []);
  const [appInitialed, setAppInitialed] = useState(false);

  const highlightContainer = useMemo(() => new PIXI.Container(), []);
  const elementMarkContainer = useMemo(() => new PIXI.Container(), []);

  // key overlays
  const pixiBgRef = useRef<PIXI.Sprite>();
  const { bgVisible, setBgVisible, elementsVisible, setTextsVisible } =
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
        const targetHeight = window.innerHeight * 0.7;
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

  // draw all texts on PIXI app
  useEffect(() => {
    if (!appInitialed) {
      return;
    }

    // draw the screenshot base64
    const img = new Image();
    img.src = screenshotBase64;
    img.onload = () => {
      if (!app.stage) return;
      const screenshotTexture = PIXI.Texture.from(img);
      const screenshotSprite = new PIXI.Sprite(screenshotTexture);
      screenshotSprite.x = 0;
      screenshotSprite.y = 0;
      screenshotSprite.width = screenWidth;
      screenshotSprite.height = screenHeight;
      app.stage.addChildAt(screenshotSprite, 0);
      pixiBgRef.current = screenshotSprite;
      screenshotSprite.alpha = bgVisible ? bgOnAlpha : bgOffAlpha;
    };
  }, [app.stage, appInitialed]);

  const rectMarkForItem = (
    rect: Rect,
    name: string,
    themeColor: string,
    alpha: number,
    onPointOver: () => void,
    onPointerOut: () => void,
  ) => {
    const { left, top, width, height } = rect;
    const graphics = new PIXI.Graphics();
    graphics.beginFill(themeColor, alpha);
    graphics.lineStyle(1, themeColor, 1);
    graphics.drawRect(left, top, width, height);
    graphics.endFill();
    graphics.interactive = true;
    graphics.on('pointerover', onPointOver);
    graphics.on('pointerout', onPointerOut);

    const nameFontSize = 18;
    const texts = new PIXI.Text(name, {
      fontSize: nameFontSize,
      fill: 0x0,
    });
    texts.x = left;
    texts.y = Math.max(top - (nameFontSize + 4), 0);
    return [graphics, texts];
  };

  const { highlightElementRects } = useMemo(() => {
    const highlightElementRects: Rect[] = [];

    highlightContainer.removeChildren();
    elementMarkContainer.removeChildren();

    // element mark
    context.content.forEach((element) => {
      const { rect, content, id } = element;
      const ifHighlight = highlightIds.includes(id);
      if (ifHighlight) {
        const [graphics] = rectMarkForItem(
          rect,
          content,
          ifHighlight
            ? highlightColorForType('element')
            : colorForName('element', content),
          ifHighlight ? 1 : itemFillAlpha,
          noop,
          noop,
        );
        highlightContainer.addChild(graphics);
      }

      const [graphics] = rectMarkForItem(
        rect,
        content,
        ifHighlight
          ? highlightColorForType('element')
          : colorForName('element', content),
        ifHighlight ? 1 : itemFillAlpha,
        () => {
          setHighlightElements([element]);
        },
        () => {
          setHighlightElements([]);
        },
      );
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
    context.content,
    // bgVisible,
    // elementsVisible,
  ]);

  const onSetBg: CheckboxProps['onChange'] = (e) => {
    setBgVisible(e.target.checked);
    if (pixiBgRef.current) {
      pixiBgRef.current.alpha = e.target.checked ? bgOnAlpha : bgOffAlpha;
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
      <div className="blackboard-filter">
        <div className="overlay-control">
          <Checkbox checked={bgVisible} onChange={onSetBg}>
            Screenshot
          </Checkbox>
          <Checkbox checked={elementsVisible} onChange={onSetElementsVisible}>
            Elements
          </Checkbox>
        </div>
      </div>
      <div className="bottom-tip">{bottomTipA}</div>

      {/* {footer} */}
    </div>
  );
};

export default BlackBoard;
