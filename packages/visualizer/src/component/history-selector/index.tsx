import { Button, Input, Typography } from 'antd';
import type React from 'react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseOutlined from '../../icons/close.svg';
import HistoryOutlined from '../../icons/history.svg';
import MagnifyingGlass from '../../icons/magnifying-glass.svg';
import { useHistoryStore } from '../../store/history';
import type { HistoryItem } from '../../store/history';
import './index.less';

const { Text } = Typography;
const HISTORY_MODAL_WIDTH = 320;
const HISTORY_MODAL_HEIGHT = 400;
const HISTORY_MODAL_GUTTER = 16;
const HISTORY_MODAL_OFFSET = 8;

interface HistorySelectorProps {
  onSelect: (history: HistoryItem) => void;
  history: HistoryItem[];
  currentType: string;
  trigger?: ReactNode;
  popupPlacement?: 'top' | 'bottom';
}

export const HistorySelector: React.FC<HistorySelectorProps> = ({
  onSelect,
  history,
  currentType,
  trigger,
  popupPlacement = 'bottom',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const clearHistory = useHistoryStore((state) => state.clearHistory);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [overlayPosition, setOverlayPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

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
    clearHistory(currentType);
    setSearchText('');
    setIsModalOpen(false); // clear and close modal
  };

  // Handle click outside to close modal
  useEffect(() => {
    if (!isModalOpen) return;

    const updateOverlayPosition = () => {
      if (!triggerRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const maxLeft = Math.max(
        HISTORY_MODAL_GUTTER,
        window.innerWidth - HISTORY_MODAL_WIDTH - HISTORY_MODAL_GUTTER,
      );
      const maxTop = Math.max(
        HISTORY_MODAL_GUTTER,
        window.innerHeight - HISTORY_MODAL_HEIGHT - HISTORY_MODAL_GUTTER,
      );
      const left = Math.min(
        Math.max(HISTORY_MODAL_GUTTER, triggerRect.right - HISTORY_MODAL_WIDTH),
        maxLeft,
      );
      const preferredTop =
        popupPlacement === 'top'
          ? triggerRect.top - HISTORY_MODAL_HEIGHT - HISTORY_MODAL_OFFSET
          : triggerRect.bottom + HISTORY_MODAL_OFFSET;
      const top = Math.min(
        Math.max(HISTORY_MODAL_GUTTER, preferredTop),
        maxTop,
      );

      setOverlayPosition({ left, top });
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsModalOpen(false);
      }
    };

    updateOverlayPosition();
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);
    window.addEventListener('resize', updateOverlayPosition);
    window.addEventListener('scroll', updateOverlayPosition, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', updateOverlayPosition);
      window.removeEventListener('scroll', updateOverlayPosition, true);
    };
  }, [isModalOpen, popupPlacement]);

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
    <div className="history-selector-wrapper">
      <div
        className="selector-trigger"
        onClick={() => setIsModalOpen(true)}
        ref={triggerRef}
      >
        {trigger ?? <HistoryOutlined width={24} height={24} />}
      </div>

      {isModalOpen &&
        overlayPosition &&
        createPortal(
          <div
            className="history-modal-overlay"
            ref={modalRef}
            style={overlayPosition}
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
                    {renderHistoryGroup(
                      'Last 7 days',
                      groupedHistory.recent7Days,
                    )}
                    {renderHistoryGroup(
                      'Last 1 year',
                      groupedHistory.recent1Year,
                    )}
                    {renderHistoryGroup('Earlier', groupedHistory.older)}

                    {/* no search result */}
                    {searchText &&
                      groupedHistory.recent7Days.length === 0 &&
                      groupedHistory.recent1Year.length === 0 &&
                      groupedHistory.older.length === 0 && (
                        <div className="no-results">
                          <Text type="secondary">
                            No matching history record
                          </Text>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
