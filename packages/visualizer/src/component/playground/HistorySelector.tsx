import { Button, Input, Modal, Typography } from 'antd';
import type React from 'react';
import { useMemo, useState } from 'react';
import CloseOutlined from '../../icons/close.svg';
import HistoryOutlined from '../../icons/history.svg';
import MagnifyingGlass from '../../icons/magnifying-glass.svg';
import { useHistoryStore } from '../store/history';
import type { HistoryItem } from '../store/history';
import './index.less';

const { Text } = Typography;

interface HistorySelectorProps {
  onSelect: (history: HistoryItem) => void;
}

export const HistorySelector: React.FC<HistorySelectorProps> = ({
  onSelect,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const history = useHistoryStore((state) => state.history);
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  // group history by time
  const groupedHistory = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const filteredHistory = history.filter((item) =>
      item.prompt.toLowerCase().includes(searchText.toLowerCase()),
    );

    const groups = {
      recent7Days: filteredHistory.filter(
        (item) => item.timestamp >= sevenDaysAgo,
      ),
      recent1Year: filteredHistory.filter(
        (item) => item.timestamp < sevenDaysAgo && item.timestamp >= oneYearAgo,
      ),
      older: filteredHistory.filter((item) => item.timestamp < oneYearAgo),
    };

    return groups;
  }, [history, searchText]);

  const handleHistoryClick = (item: HistoryItem) => {
    onSelect(item);
    setIsModalOpen(false);
  };

  const handleClearHistory = () => {
    clearHistory();
    setSearchText('');
    setIsModalOpen(false); // clear and close modal
  };

  const renderHistoryGroup = (title: string, items: HistoryItem[]) => {
    if (items.length === 0) return null;

    return (
      <div className="history-group" key={title}>
        <div className="history-group-title">{title}</div>
        {items.map((item, index) => (
          <div
            key={`${item.timestamp}-${index}`}
            className="history-item"
            onClick={() => handleHistoryClick(item)}
          >
            {item.prompt}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="selector-trigger" onClick={() => setIsModalOpen(true)}>
        <HistoryOutlined width={24} height={24} />
      </div>

      <Modal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width="100%"
        closable={false}
        centered={false}
        transitionName=""
        maskTransitionName=""
        style={{
          margin: 0,
          padding: 0,
          maxWidth: 'none',
          top: 'auto',
          bottom: 0,
        }}
        styles={{
          wrapper: {
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 0,
            display: 'flex',
          },
          body: {
            height: '70vh',
            padding: 0,
            margin: 0,
          },
          content: {
            height: '70vh',
            borderRadius: '12px 12px 0 0',
            margin: 0,
            padding: 0,
            marginBottom: 0,
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
          },
        }}
        maskClosable={true}
        destroyOnClose
      >
        <div className="history-modal-container">
          {/* top title bar */}
          <div className="history-modal-header">
            <Text strong style={{ fontSize: '16px' }}>
              History ({history.length})
            </Text>
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined width={16} height={16} />}
              onClick={() => setIsModalOpen(false)}
              className="close-button"
            />
          </div>

          {/* search bar */}
          <div className="history-search-section">
            <div className="search-input-wrapper">
              <Input
                placeholder="Search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                prefix={<MagnifyingGlass width={18} height={18} />}
                className="search-input"
                allowClear
              />
              <Button
                type="link"
                onClick={handleClearHistory}
                className="clear-button"
                disabled={history.length === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* history content */}
          <div className="history-content">
            {history.length === 0 ? (
              /* no history record */
              <div className="no-results">
                <Text type="secondary">No history record</Text>
              </div>
            ) : (
              <>
                {renderHistoryGroup('Last 7 days', groupedHistory.recent7Days)}
                {renderHistoryGroup('Last 1 year', groupedHistory.recent1Year)}
                {renderHistoryGroup('Earlier', groupedHistory.older)}

                {/* no search result */}
                {searchText &&
                  groupedHistory.recent7Days.length === 0 &&
                  groupedHistory.recent1Year.length === 0 &&
                  groupedHistory.older.length === 0 && (
                    <div className="no-results">
                      <Text type="secondary">No matching history record</Text>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
