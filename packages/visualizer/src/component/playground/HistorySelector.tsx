import { HistoryOutlined } from '@ant-design/icons';
import { Dropdown, type MenuProps, Space } from 'antd';
import type React from 'react';
import { useHistoryStore } from '../store/history';
import type { HistoryItem } from '../store/history';
import { actionNameForType } from './playground-utils';

interface HistorySelectorProps {
  onSelect: (history: HistoryItem) => void;
}

export const HistorySelector: React.FC<HistorySelectorProps> = ({
  onSelect,
}) => {
  const history = useHistoryStore((state) => state.history);
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  const items: MenuProps['items'] = history.map((item, index) => ({
    label: (
      <a onClick={() => onSelect(item)}>
        {actionNameForType(item.type)} - {item.prompt.slice(0, 50)}
        {item.prompt.length > 50 ? '...' : ''}
      </a>
    ),
    key: String(index),
  }));

  if (history.length === 0) {
    return null;
  }

  items.push({
    type: 'divider',
  });

  items.push({
    label: (
      <a onClick={() => clearHistory()}>
        <Space>Clear History</Space>
      </a>
    ),
    key: 'clear',
  });

  return (
    <div className="history-selector">
      <Dropdown menu={{ items }}>
        <Space>
          <HistoryOutlined />
          history
        </Space>
      </Dropdown>
    </div>
  );
};
