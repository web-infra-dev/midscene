import React, { useState, useEffect } from 'react';
import { Typography } from 'antd';
import { DownOutlined } from '@ant-design/icons';

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

    // Auto-collapse thinking process when streaming completes
    useEffect(() => {
        if (!isStreaming && hasThinking && actualCode) {
            const timer = setTimeout(() => {
                setShowThinking(false);
            }, 2000); // Auto-collapse after 2 seconds
            return () => clearTimeout(timer);
        }
    }, [isStreaming, hasThinking, actualCode]);

    // Reset showThinking when starting new generation
    useEffect(() => {
        if (isStreaming) {
            setShowThinking(true);
        }
    }, [isStreaming]);

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
                <div className={`${colors.text} text-sm font-medium`}>🤔 AI Thinking Process</div>
                <div className={`transform transition-transform ${showThinking ? 'rotate-180' : ''}`}>
                    <DownOutlined className={`${colors.icon} text-xs`} />
                </div>
                {isStreaming && hasThinking && (
                    <div className="flex items-center gap-1 ml-auto">
                        <div className={`animate-pulse w-2 h-2 ${colors.pulse} rounded-full`}></div>
                        <Text className={`text-xs ${colors.text}`}>Thinking...</Text>
                    </div>
                )}
            </div>
            {showThinking && (
                <div className={`p-3 ${colors.content} border-l border-r border-b ${colors.border} rounded-b text-sm text-gray-700 whitespace-pre-wrap`}>
                    {accumulatedThinking || 'AI is analyzing the recorded events and planning the test structure...'}
                </div>
            )}
        </div>
    );
}; 