import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { iconForStatus, timeCostStrElement } from '@midscene/visualizer';
import { Input, Select } from 'antd';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExecutionDumpWithPlaywrightAttributes } from '../types';
import './PlaywrightCaseSelector.less';

// define all possible test statuses
const TEST_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'timedOut', label: 'Timed Out' },
  { value: 'interrupted', label: 'Interrupted' },
];

interface PlaywrightCaseSelectorProps {
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}

export function PlaywrightCaseSelector({
  dumps,
  selected,
  onSelect,
}: PlaywrightCaseSelectorProps): JSX.Element | null {
  if (!dumps || dumps.length <= 1) return null;

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasSearchText, setHasSearchText] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isExpanded &&
        selectorRef.current &&
        !selectorRef.current.contains(event.target as Node)
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

  const nameForDump = (dump: GroupedActionDump) =>
    `${dump.groupName} - ${dump.groupDescription}`;

  const contentForDump = (
    dump: ExecutionDumpWithPlaywrightAttributes,
    key: React.Key,
  ) => {
    const status = iconForStatus(dump.attributes?.playwright_test_status);
    const costStr = dump.attributes?.playwright_test_duration;
    const cost = costStr ? (
      <span key={key} className="cost-str">
        {' '}
        ({timeCostStrElement(Number.parseInt(costStr, 10))})
      </span>
    ) : null;
    const rowContent = (
      <span key={key}>
        {status}
        {'  '}
        {nameForDump(dump)}
        {cost}
      </span>
    );
    return rowContent;
  };

  const filteredDumps = useMemo(() => {
    let result = dumps || [];

    // apply text filter
    if (searchText) {
      result = result.filter((dump) =>
        nameForDump(dump).toLowerCase().includes(searchText.toLowerCase()),
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

  const handleOptionClick = (dump: GroupedActionDump) => {
    if (onSelect) {
      onSelect(dump);
    }
    setIsExpanded(false);
  };

  const selectedDump = selected as ExecutionDumpWithPlaywrightAttributes;
  const displayText = selected
    ? `${selectedDump.groupName} - (${selectedDump.attributes?.playwright_test_duration / 1000}s)`
    : 'Select a case';

  return (
    <div
      ref={selectorRef}
      className={`modern-playwright-selector ${isExpanded ? 'expanded' : ''}`}
    >
      {/* Header */}
      <div className="selector-header" onClick={toggleExpanded}>
        <div className="header-content">
          <span className="check-icon">
            {iconForStatus(selectedDump.attributes?.playwright_test_status)}
          </span>
          <span className="header-text">{displayText}</span>
        </div>
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
          <div className="filter-controls">
            <div
              className={`search-container ${hasSearchText ? 'has-content' : ''}`}
            >
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                style={{ width: 80 }}
                options={TEST_STATUS_OPTIONS}
                size="small"
                bordered={false}
              />
              <div className="search-input-container">
                <Input
                  placeholder="Search by name"
                  value={searchText}
                  onChange={handleSearchChange}
                  suffix={<SearchOutlined style={{ color: '#ccc' }} />}
                  bordered={false}
                />
              </div>
            </div>
          </div>

          {/* Options List */}
          <div className="options-list">
            {filteredDumps.map((dump, index) => (
              <div
                key={index}
                className={`option-item ${selected === dump ? 'selected' : ''}`}
                onClick={() => handleOptionClick(dump)}
              >
                <div className="option-content">
                  {contentForDump(dump, index)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
