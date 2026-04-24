import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { iconForStatus, timeCostStrElement } from '@midscene/visualizer';
import { Input, Select } from 'antd';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaywrightTaskAttributes, PlaywrightTasks } from '../../types';
import './index.less';
import { type DumpStoreType, useExecutionDump } from '../store';

// define all possible test statuses
const TEST_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'timedOut', label: 'Timeout' },
  { value: 'interrupted', label: 'Interrupted' },
];

interface PlaywrightCaseSelectorProps {
  dumps?: PlaywrightTasks[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}

function PlaywrightCaseTitle(props: {
  attributes: Pick<
    PlaywrightTaskAttributes,
    | 'playwright_test_title'
    | 'playwright_test_description'
    | 'playwright_test_duration'
    | 'playwright_test_status'
  >;
}): JSX.Element {
  const { attributes } = props;
  const status = iconForStatus(attributes.playwright_test_status);
  const costStr = attributes.playwright_test_duration;
  const cost = costStr ? (
    <span className="cost-str">
      {' '}
      ({timeCostStrElement(Number(costStr) || 0)})
    </span>
  ) : null;

  return (
    <span>
      {status}
      {'  '}
      {attributes.playwright_test_title || 'unnamed'}
      {attributes.playwright_test_description
        ? ` - ${attributes.playwright_test_description}`
        : ''}
      {cost}
    </span>
  );
}

export function PlaywrightCaseSelector({
  dumps,
}: PlaywrightCaseSelectorProps): JSX.Element | null {
  if (!dumps || dumps.length === 0) return null;
  if (dumps.length === 1 && !dumps[0].attributes?.is_merged) return null;

  const playwrightAttributes = useExecutionDump(
    (store) => store.playwrightAttributes,
  );
  const setGroupedDump = useExecutionDump(
    (store: DumpStoreType) => store.setGroupedDump,
  );
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasSearchText, setHasSearchText] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is on Select dropdown
      const target = event.target as HTMLElement;
      const isSelectDropdown = target.closest('.ant-select-dropdown');

      if (
        isExpanded &&
        selectorRef.current &&
        !selectorRef.current.contains(event.target as Node) &&
        !isSelectDropdown
      ) {
        setIsExpanded(false);
      }
    };

    const handleScroll = () => {
      if (isExpanded && selectorRef.current) {
        const rect = selectorRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 10,
          left: rect.left,
        });
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isExpanded]);

  const titleForDump = (
    dump: Pick<PlaywrightTasks, 'attributes'>,
    key: React.Key,
  ) => <PlaywrightCaseTitle key={key} attributes={dump.attributes} />;

  const filteredDumps = useMemo(() => {
    let result = dumps || [];

    // apply text filter
    if (searchText) {
      result = result.filter(
        (dump) =>
          (dump.attributes.playwright_test_title || '')
            .toLowerCase()
            .includes(searchText.toLowerCase()) ||
          (dump.attributes.playwright_test_description || '')
            .toLowerCase()
            .includes(searchText.toLowerCase()),
      );
    }

    // apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(
        (dump) => dump.attributes?.playwright_test_status === statusFilter,
      );
    }

    return result;
  }, [dumps, searchText, statusFilter]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    setHasSearchText(value.length > 0);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
  };

  const toggleExpanded = () => {
    if (!isExpanded && selectorRef.current) {
      const rect = selectorRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 10,
        left: rect.left,
      });
    }
    setIsExpanded(!isExpanded);
  };

  const handlePlaywrightTaskSelect = async (dump: PlaywrightTasks) => {
    await setGroupedDump(dump.get(), dump.attributes);
    setIsExpanded(false);
  };

  const displayHeader = playwrightAttributes ? (
    <PlaywrightCaseTitle attributes={playwrightAttributes} />
  ) : (
    'Select a case'
  );

  return (
    <div
      ref={selectorRef}
      className={`modern-playwright-selector ${isExpanded ? 'expanded' : ''}`}
    >
      {/* Header */}
      <div className="selector-header" onClick={toggleExpanded}>
        <div className="header-content">{displayHeader}</div>
        <div className="arrow-icon">
          {isExpanded ? <UpOutlined /> : <DownOutlined />}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div
          className="selector-content"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          {/* Filter Controls */}
          <div className="filter-controls" onClick={(e) => e.stopPropagation()}>
            <div
              className={`search-container ${hasSearchText ? 'has-content' : ''}`}
            >
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                style={{ width: 120 }}
                options={TEST_STATUS_OPTIONS}
                size="small"
                variant="borderless"
                popupMatchSelectWidth={false}
                getPopupContainer={() => document.body}
              />
              <div className="search-input-container">
                <Input
                  placeholder="Search by name"
                  value={searchText}
                  onChange={handleSearchChange}
                  suffix={<SearchOutlined style={{ color: '#ccc' }} />}
                  variant="borderless"
                />
              </div>
            </div>
          </div>

          {/* Options List */}
          <div className="options-list">
            {filteredDumps.map((dump, index) => (
              <div
                key={index}
                className={`option-item ${playwrightAttributes?.playwright_test_id === dump.attributes.playwright_test_id ? 'selected' : ''}`}
                onClick={() => handlePlaywrightTaskSelect(dump)}
              >
                <div className="option-content">
                  {titleForDump(dump, index)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
