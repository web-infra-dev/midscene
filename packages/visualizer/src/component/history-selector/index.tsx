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
  title?: string;
  showClear?: boolean;
  onClear?: () => void;
  searchPlaceholder?: string;
  emptyText?: string;
  noMatchText?: string;
  renderItemActions?: (
    history: HistoryItem,
    controls: { close: () => void; scrollVersion: number },
  ) => ReactNode;
  overlayClassName?: string;
  popupWidth?: number;
  popupHeight?: number;
  portalContainerSelector?: string;
}

export const HistorySelector: React.FC<HistorySelectorProps> = ({
  onSelect,
  history,
  currentType,
  trigger,
  popupPlacement = 'bottom',
  title = 'History',
  showClear = true,
  onClear,
  searchPlaceholder = 'Search',
  emptyText = 'No history record',
  noMatchText = 'No matching history record',
  renderItemActions,
  overlayClassName,
  popupWidth = HISTORY_MODAL_WIDTH,
  popupHeight = HISTORY_MODAL_HEIGHT,
  portalContainerSelector,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [scrollVersion, setScrollVersion] = useState(0);
  const clearHistory = useHistoryStore((state) => state.clearHistory);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [overlayPosition, setOverlayPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null);
  const [isOverlayInContainer, setIsOverlayInContainer] = useState(false);

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

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleClearHistory = () => {
    if (onClear) {
      onClear();
    } else {
      clearHistory(currentType);
    }
    setSearchText('');
    setIsModalOpen(false); // clear and close modal
  };

  // Handle click outside to close modal
  useEffect(() => {
    if (!isModalOpen) return;

    const updateOverlayPosition = () => {
      if (!triggerRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const portalContainer = portalContainerSelector
        ? (triggerRef.current.closest(
            portalContainerSelector,
          ) as HTMLElement | null)
        : null;
      const boundaryRect = portalContainer?.getBoundingClientRect();
      const boundaryWidth = boundaryRect?.width ?? window.innerWidth;
      const boundaryHeight = boundaryRect?.height ?? window.innerHeight;
      const triggerRight = boundaryRect
        ? triggerRect.right - boundaryRect.left
        : triggerRect.right;
      const triggerTop = boundaryRect
        ? triggerRect.top - boundaryRect.top
        : triggerRect.top;
      const triggerBottom = boundaryRect
        ? triggerRect.bottom - boundaryRect.top
        : triggerRect.bottom;
      const maxLeft = Math.max(
        HISTORY_MODAL_GUTTER,
        boundaryWidth - popupWidth - HISTORY_MODAL_GUTTER,
      );
      const maxTop = Math.max(
        HISTORY_MODAL_GUTTER,
        boundaryHeight - popupHeight - HISTORY_MODAL_GUTTER,
      );
      const left = Math.min(
        Math.max(HISTORY_MODAL_GUTTER, triggerRight - popupWidth),
        maxLeft,
      );
      const preferredTop =
        popupPlacement === 'top'
          ? triggerTop - popupHeight - HISTORY_MODAL_OFFSET
          : triggerBottom + HISTORY_MODAL_OFFSET;
      const top = Math.min(
        Math.max(HISTORY_MODAL_GUTTER, preferredTop),
        maxTop,
      );

      setOverlayPosition({ left, top });
      setOverlayTarget(portalContainer ?? document.body);
      setIsOverlayInContainer(Boolean(portalContainer));
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
  }, [
    isModalOpen,
    popupHeight,
    popupPlacement,
    popupWidth,
    portalContainerSelector,
  ]);

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
            <span className="history-item-label">{item.prompt}</span>
            {renderItemActions ? (
              <span
                className="history-item-actions"
                onClick={(event) => event.stopPropagation()}
              >
                {renderItemActions(item, { close: closeModal, scrollVersion })}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="history-selector-wrapper">
      <div
        className="selector-trigger"
        onClick={() => setIsModalOpen((current) => !current)}
        ref={triggerRef}
      >
        {trigger ?? <HistoryOutlined width={24} height={24} />}
      </div>

      {isModalOpen &&
        overlayPosition &&
        overlayTarget &&
        createPortal(
          <div
            className={
              overlayClassName
                ? `history-modal-overlay ${overlayClassName}${
                    isOverlayInContainer
                      ? ' history-modal-overlay-in-container'
                      : ''
                  }`
                : `history-modal-overlay${
                    isOverlayInContainer
                      ? ' history-modal-overlay-in-container'
                      : ''
                  }`
            }
            ref={modalRef}
            style={overlayPosition}
          >
            <div className="history-modal-container">
              {/* top title bar */}
              <div className="history-modal-header">
                <Text strong style={{ fontSize: '16px' }}>
                  {title} ({history.length})
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
                    placeholder={searchPlaceholder}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    prefix={<MagnifyingGlass width={18} height={18} />}
                    className="search-input"
                    allowClear
                  />
                  {showClear ? (
                    <Button
                      type="link"
                      onClick={handleClearHistory}
                      className="clear-button"
                      disabled={history.length === 0}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* history content */}
              <div
                className="history-content"
                onScroll={() => {
                  setScrollVersion((current) => current + 1);
                }}
              >
                {history.length === 0 ? (
                  /* no history record */
                  <div className="no-results">
                    <Text type="secondary">{emptyText}</Text>
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
                          <Text type="secondary">{noMatchText}</Text>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>,
          overlayTarget,
        )}
    </div>
  );
};
