'use client';

import type { Rect, UIContext } from '@midscene/core';
import type { WebUIContext } from '@midscene/web/utils';
import { useEffect, useRef, useState } from 'react';
import { useStaticPageAgent } from './playground/useStaticPageAgent';
import './describer.less';
import { Spin } from 'antd';
import { Blackboard } from './blackboard';

const distanceOfTwoPoints = (p1: [number, number], p2: [number, number]) => {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  return Math.round(Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2));
};

const includedInRect = (point: [number, number], rect: Rect) => {
  const [x, y] = point;
  const { left, top, width, height } = rect;
  return x >= left && x <= left + width && y >= top && y <= top + height;
};

const distanceThreshold = 20;

export const Describer = (props: { uiContext: UIContext }): JSX.Element => {
  const { uiContext } = props;
  const image = uiContext.screenshotBase64;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highlightPoints, setHighlightPoints] = useState<[number, number][]>(
    [],
  );
  const [highlightRect, setHighlightRect] = useState<Rect | undefined>();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | {
        prompt?: string;
        rect?: Rect;
        distance?: number;
        pass?: boolean;
        error?: string;
      }
    | undefined
  >();

  const agent = useStaticPageAgent(uiContext as WebUIContext);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Set canvas dimensions to match the image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0);
    };

    // Set the image source (base64 data)
    img.src = image;
  }, [image]);

  const handleClick = async (position: [number, number]) => {
    console.log('handleClick', position);
    if (!agent) {
      console.error('agent is not initialized');
      return;
    }

    setLoading(true);
    setResult(undefined);

    try {
      const userLocation: [number, number] = [position[0], position[1]];
      setHighlightPoints([userLocation]);

      const text = await agent?.aiDescribe(userLocation);
      console.log('describe text', text);
      setResult({
        prompt: text,
      });
      const locateResult = await agent?.aiLocate(text!);

      const { center, rect } = locateResult;

      setHighlightRect(rect);

      const distance = distanceOfTwoPoints(center, userLocation);
      const included = includedInRect(userLocation, rect);
      console.log('distance', distance, 'included', included);

      setLoading(false);
      setResult({
        prompt: text,
        rect,
        distance,
        pass: distance <= distanceThreshold || included,
      });
    } catch (error: any) {
      setLoading(false);
      setResult({
        error: error.message,
      });
    }
  };

  let resultClass = 'loading';
  let resultText = 'Loading...';
  if (!loading && (result?.prompt || result?.error)) {
    resultClass = result?.pass ? 'success' : 'error';
    resultText = result?.prompt || result?.error || 'Unknown result';
  }

  return (
    <div className="image-describer">
      <Blackboard
        uiContext={{
          ...uiContext,
          content: [], // remove all contents
          tree: {
            node: null,
            children: [],
          },
        }}
        highlightPoints={highlightPoints}
        highlightRect={highlightRect}
        onCanvasClick={handleClick}
        hideController={true}
      />
      {(result?.prompt || loading) && (
        <Spin spinning={loading}>
          <div className={`describe-text ${resultClass}`}>{resultText}</div>
        </Spin>
      )}
    </div>
  );
};

export default Describer;
