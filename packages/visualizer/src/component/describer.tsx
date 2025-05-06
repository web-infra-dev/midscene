'use client';

import type {
  AgentDescribeElementAtPointResult,
  Rect,
  UIContext,
} from '@midscene/core';
import type { WebUIContext } from '@midscene/web/utils';
import { useEffect, useRef, useState } from 'react';
import { useStaticPageAgent } from './playground/useStaticPageAgent';
import './describer.less';
import { Spin } from 'antd';
import { Blackboard } from './blackboard';

export const Describer = (props: { uiContext: UIContext }): JSX.Element => {
  const { uiContext } = props;
  const image = uiContext.screenshotBase64;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [highlightPoints, setHighlightPoints] = useState<[number, number][]>(
    [],
  );
  const [highlightRect, setHighlightRect] = useState<Rect | undefined>();

  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    AgentDescribeElementAtPointResult | undefined
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
    if (!agent) {
      console.error('agent is not initialized');
      return;
    }

    setLoading(true);
    setError(undefined);
    setResult(undefined);
    setHighlightPoints([]);
    setHighlightRect(undefined);

    try {
      const userLocation: [number, number] = [position[0], position[1]];
      setHighlightPoints([userLocation]);

      const result = await agent?.describeElementAtPoint(userLocation);
      console.log('describe result', result);
      setResult(result);
      if (result.verifyResult?.rect) {
        setHighlightRect(result.verifyResult.rect);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  let resultClass;
  let resultText;
  if (error) {
    resultClass = 'error';
    resultText = error;
  } else if (result && !result.verifyResult?.pass) {
    resultClass = 'error';
    resultText = `Locate failed with prompt: ${result.prompt}`;
  } else if (result) {
    resultClass = 'success';
    resultText = result.prompt;
  } else if (loading) {
    resultClass = 'loading';
    resultText = 'Loading...';
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
      {(result || loading) && (
        <Spin spinning={loading}>
          <div className={`describe-text ${resultClass}`}>{resultText}</div>
        </Spin>
      )}
    </div>
  );
};

export default Describer;
