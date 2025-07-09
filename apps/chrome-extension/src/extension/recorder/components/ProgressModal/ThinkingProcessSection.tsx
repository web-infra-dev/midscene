import { DownOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

const { Text } = Typography;

interface ThinkingProcessSectionProps {
  accumulatedThinking: string;
  isStreaming: boolean;
  actualCode: string;
  themeColor?: 'blue' | 'green';
}

export const ThinkingProcessSection: React.FC<ThinkingProcessSectionProps> = ({
  accumulatedThinking,
  isStreaming,
  actualCode,
  themeColor = 'blue',
}) => {
  const [showThinking, setShowThinking] = useState(true);
  const hasThinking = accumulatedThinking.length > 0;
  const contentRef = useRef<HTMLDivElement>(null);

  // Detect if thinking process has ended - when actual code content appears, thinking is finished
  useEffect(() => {
    if (actualCode) {
      // Actual code content appeared, thinking process has ended, collapse immediately
      setShowThinking(false);
    } else {
      setShowThinking(true);
    }
  }, [actualCode]);

  // 滚动到最新思考内容
  useEffect(() => {
    if (showThinking && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [accumulatedThinking, showThinking]);

  if (!hasThinking) return null;


  return (
    <div className="mb-3 rounded-[8px] min-h-[40px]" style={{ background: showThinking ? "linear-gradient(180deg, rgba(43, 131, 255, 0.1) 0%, rgba(43, 131, 255, 0.024) 23.04%, rgba(43, 131, 255, 0) 100%)" : "linear-gradient(0deg, #FFFFFF, #FFFFFF)", border: showThinking ? '1px solid rgba(43, 131, 255, 0.16)' : '1px solid rgba(0, 0, 0, 0.06)' }}>
      <div
        className={`flex items-center gap-2 cursor-pointer p-2 bg-transparent`}
        onClick={() => setShowThinking(!showThinking)}
      // style={{ borderBottom: showThinking ? '1px solid rgba(43, 131, 255, 0.16)' : 'none' }}
      >
        <div className={` text-sm font-medium`} style={{ color: 'rgba(0, 0, 0, 0.85)' }}>
          🧠  AI Thingking Process
        </div>
        <div
          className={`transform transition-transform ml-auto mr-1 ${showThinking ? 'rotate-180' : ''}`}
        >
          <DownOutlined className={`text-blue-400 text-xs`} style={{ color: 'rgba(128, 128, 128, 1)' }} />
        </div>
      </div>
      {showThinking && (
        <div
          ref={contentRef}
          className={`p-3 bg-blue-25  rounded-b text-sm text-gray-400 whitespace-pre-wrap`}
          style={{ maxHeight: 200, overflowY: 'auto' }}
        >
          {accumulatedThinking ||
            'AI is analyzing the recorded events and planning the test structure...'}
        </div>
      )}
    </div>
  );
};
