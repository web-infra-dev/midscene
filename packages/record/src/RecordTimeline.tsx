import {
    AimOutlined,
    CompassOutlined,
    EditOutlined,
    KeyOutlined,
    MoreOutlined,
    VerticalAlignTopOutlined
} from '@ant-design/icons';
import { Button, Card, Image, Space, Tag, Timeline, Typography } from 'antd';
// biome-ignore lint/style/useImportType: <explanation>
import React from 'react';

const { Text, Title } = Typography;

interface RecordedEvent {
    type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown';
    timestamp: number;
    x?: number;
    y?: number;
    value?: string;
    element?: HTMLElement;
    targetTagName?: string;
    targetId?: string;
    targetClassName?: string;
    url?: string;
    title?: string;
    screenshot?: string;
}

interface RecordTimelineProps {
    events: RecordedEvent[];
    onEventClick?: (event: RecordedEvent, index: number) => void;
}

export const RecordTimeline = ({ events, onEventClick }: RecordTimelineProps) => {
    const getEventIcon = (type: string) => {
        switch (type) {
            case 'click':
                return <AimOutlined style={{ color: '#1890ff' }} />;
            case 'input':
                return <EditOutlined style={{ color: '#52c41a' }} />;
            case 'scroll':
                return <VerticalAlignTopOutlined style={{ color: '#faad14' }} />;
            case 'navigation':
                return <CompassOutlined style={{ color: '#722ed1' }} />;
            case 'setViewport':
                return <CompassOutlined style={{ color: '#eb2f96' }} />;
            case 'keydown':
                return <KeyOutlined style={{ color: '#fa8c16' }} />;
            default:
                return <MoreOutlined />;
        }
    };

    const getEventColor = (type: string) => {
        switch (type) {
            case 'click':
                return '#1890ff';
            case 'input':
                return '#52c41a';
            case 'scroll':
                return '#faad14';
            case 'navigation':
                return '#722ed1';
            case 'setViewport':
                return '#eb2f96';
            case 'keydown':
                return '#fa8c16';
            default:
                return '#d9d9d9';
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getEventTitle = (event: RecordedEvent) => {
        switch (event.type) {
            case 'click':
                if (event.targetTagName === 'BUTTON') {
                    return 'Click Button';
                }
                if (event.value) {
                    return `Click Element "${event.value}"`;
                }
                return 'Click';
            case 'input':
                return 'Change';
            case 'scroll':
                return 'Scroll';
            case 'navigation':
                return event.title || 'Navigate';
            case 'setViewport':
                return 'Set viewport';
            case 'keydown':
                return 'Key down';
            default:
                return event.type;
        }
    };

    const getEventDescription = (event: RecordedEvent) => {
        switch (event.type) {
            case 'click':
                return (
                    <Space direction="vertical" size="small">
                        {event.targetTagName && (
                            <Text type="secondary">Element "{event.targetTagName}"</Text>
                        )}
                        {event.x !== undefined && event.y !== undefined && (
                            <Text type="secondary">Position: ({event.x}, {event.y})</Text>
                        )}
                    </Space>
                );
            case 'input':
                return (
                    <Space direction="vertical" size="small">
                        <Text type="secondary">Element "{event.targetTagName || 'Input'}"</Text>
                        {event.value && <Text code>"{event.value}"</Text>}
                    </Space>
                );
            case 'scroll':
                return (
                    <Text type="secondary">
                        Position: ({event.x || 0}, {event.y || 0})
                    </Text>
                );
            case 'navigation':
                return (
                    <Space direction="vertical" size="small">
                        {event.url && <Text type="secondary">{event.url}</Text>}
                    </Space>
                );
            case 'setViewport':
                return (
                    <Text type="secondary">
                        Desktop 964x992 px
                    </Text>
                );
            case 'keydown':
                return (
                    <Text type="secondary">
                        Key: {event.value || 'Unknown'}
                    </Text>
                );
            default:
                return null;
        }
    };

    const timelineItems = events.map((event, index) => ({
        dot: getEventIcon(event.type),
        color: getEventColor(event.type),
        children: (
            <Card
                size="small"
                bordered={false}
                style={{ marginBottom: 8, cursor: 'pointer' }}
                onClick={() => onEventClick?.(event, index)}
                bodyStyle={{ padding: '12px 16px' }}
            >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                            <Text strong>{getEventTitle(event)}</Text>
                            <Tag color={getEventColor(event.type)}>{event.type}</Tag>
                        </Space>
                        <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Handle more actions
                            }}
                        />
                    </Space>
                    {getEventDescription(event)}
                    {event.screenshot && (
                        <Image
                            src={event.screenshot}
                            width={60}
                            height={40}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                            preview={false}
                        />
                    )}
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                        {formatTime(event.timestamp)}
                    </Text>
                </Space>
            </Card>
        ),
    }));

    return (
        <div style={{ padding: '16px' }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Title level={4} style={{ margin: 0 }}>
                        Recording Timeline
                    </Title>
                    <Space>
                        <Text type="secondary">
                            {events.length} events recorded
                        </Text>
                    </Space>
                </div>

                <Timeline
                    mode="left"
                    items={timelineItems}
                    style={{ paddingTop: 16 }}
                />
            </Space>
        </div>
    );
};
