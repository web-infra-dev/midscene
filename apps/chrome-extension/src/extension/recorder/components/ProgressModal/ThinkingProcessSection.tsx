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

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      bgHover: 'hover:bg-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-600',
      icon: 'text-blue-400',
      pulse: 'bg-blue-500',
      content: 'bg-blue-25',
    },
    green: {
      bg: 'bg-green-50',
      bgHover: 'hover:bg-green-100',
      border: 'border-green-200',
      text: 'text-green-600',
      icon: 'text-green-400',
      pulse: 'bg-green-500',
      content: 'bg-green-25',
    },
  };

  const colors = colorClasses[themeColor];

  return (
    <div className="mb-3">
      <div
        className={`flex items-center gap-2 cursor-pointer p-2 ${colors.bg} rounded-t border ${colors.border} ${colors.bgHover} transition-colors`}
        onClick={() => setShowThinking(!showThinking)}
      >
        <div className={`${colors.text} text-sm font-medium`}>
          🤔 AI Thinking Process
        </div>
        <div
          className={`transform transition-transform ${showThinking ? 'rotate-180' : ''}`}
        >
          <DownOutlined className={`${colors.icon} text-xs`} />
        </div>
        {isStreaming && hasThinking && (
          <div className="flex items-center gap-1 ml-auto">
            <div
              className={`animate-pulse w-2 h-2 ${colors.pulse} rounded-full`}
            />
            <Text className={`text-xs ${colors.text}`}>Thinking...</Text>
          </div>
        )}
      </div>
      {showThinking && (
        <div
          ref={contentRef}
          className={`p-3 ${colors.content} border-l border-r border-b ${colors.border} rounded-b text-sm text-gray-400 whitespace-pre-wrap`}
          style={{ maxHeight: 200, overflowY: 'auto' }}
        >
          {accumulatedThinking ||
            'AI is analyzing the recorded events and planning the test structure...'}
        </div>
      )}
    </div>
  );
};
